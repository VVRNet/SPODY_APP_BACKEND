import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollClass, SchemaClass } from '../../db/class'
import { CollFollow, SchemaFollow } from '../../db/follow'
import { CollUser, SchemaUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'

const reqBody = Type.Object({
  targetId: Type.String({
    description: '팔로우 대상 학생/반 id',
    minLength: 1,
  }),
  targetType: Type.Enum<{ std: 'std'; class: 'class' }>(
    {
      std: 'std',
      class: 'class',
    },
    { description: '팔로우 대상의 학생/반 여부 - std(학생),class(반)', examples: ['std'] },
  ),
  classId: Type.Optional(
    Type.String({
      description: '기관의 반이 팔로우하는 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

type stdOrClass = {
  id?: ObjectId
  name?: string
  orgId?: ObjectId
  orgName?: string
}

export const ApiFollowAdd: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['팔로우'],
      summary: '다른 학생/반을 팔로우',
      description: `[ 400에러 코드 ]
      
      . FOLLOW_WRONG_ID : 팔로우 대상 id가 잘못됨
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
      . FOLLOW_ALREADY : 이미 팔로우함
      . FOLLOW_NOTFOUND : 팔로우 대상을 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      const targetId = StrToObjectId(request.body.targetId, 'FOLLOW')

      let classId: ObjectId | undefined
      if (request.body.classId != null) {
        classId = StrToObjectId(request.body.classId, 'CLASS')
      }

      if ((userType !== 'org' && classId != null) || (userType !== 'std' && classId == null)) {
        throw new ExError('wrong user/class id', {
          type: 'ext',
          code: 'PARAM_TYPE_NOTMATCH',
        })
      }

      // 이미 존재하는 관계가 있는지 검색
      let existedFollow: WithId<SchemaFollow> | null
      try {
        existedFollow = await CollFollow.findOne({
          fromId: userId,
          toId: targetId,
          fromOrgId: (userType === 'org' ? { $ne: null } : null) as any,
          toOrgId: (request.body.targetType === 'class' ? { $ne: null } : null) as any,
        })
      } catch (e) {
        throw new ExError('fail to get existed follow', {
          type: 'int',
          code: 'DB_GET_FOLLOW',
          err: e,
        })
      }
      if (existedFollow != null) {
        throw new ExError('already following', {
          type: 'ext',
          code: 'FOLLOW_ALREADY',
        })
      }

      // 유저의 학생/반 정보 확인
      const fromData = userType === 'std' ? await getUser(userId) : await getClass(classId!)
      if (fromData.id == null) {
        throw new ExError('fail to get user', {
          type: 'int',
          code: 'DB_GET_USER',
        })
      }
      if (fromData.orgId != null && !fromData.orgId.equals(userId)) {
        throw new ExError('fail to get user', {
          type: 'ext',
          code: 'PARAM_TYPE_NOTMATCH',
        })
      }

      // 팔로우하는 학생/반 정보 확인
      const toData =
        request.body.targetType === 'std' ? await getUser(targetId) : await getClass(targetId)
      if (toData.id == null) {
        throw new ExError('follow target not existed', {
          type: 'ext',
          code: 'FOLLOW_NOTFOUND',
        })
      }

      // 팔로우 데이터 생성
      try {
        await CollFollow.insertOne({
          fromId: fromData.id,
          fromName: fromData.name ?? '',
          fromOrgId: fromData.orgId,
          fromOrgName: fromData.orgName,
          toId: toData.id,
          toName: toData.name ?? '',
          toOrgId: toData.orgId,
          toOrgName: toData.orgName,
        })
      } catch (e) {
        throw new ExError('fail to insert follow', {
          type: 'int',
          code: 'DB_INSERT_FOLLOW',
        })
      }

      // TODO: 팔로우 대상에게 알림 및 푸시

      // API 응답
      reply.send(ResOkValue)
    },
  })
}

const getUser = async (id: ObjectId): Promise<stdOrClass> => {
  let userInfo: WithId<SchemaUser> | null = null
  try {
    userInfo = await CollUser.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('failed to get user', {
      type: 'int',
      code: 'DB_GET_USER',
      err: e,
      info: {
        id: id.toHexString(),
      },
    })
  }
  return {
    id: id,
    name: userInfo?.name,
  }
}

const getClass = async (id: ObjectId): Promise<stdOrClass> => {
  type classWithUser = SchemaClass & { users: SchemaUser[] }
  let classInfo: classWithUser[]
  try {
    classInfo = await CollClass.aggregate<classWithUser>([
      {
        $match: { _id: id },
      },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'users',
        },
      },
    ]).toArray()
  } catch (e) {
    throw new ExError('failed to get class with org', {
      type: 'int',
      code: 'DB_GET_CLASS',
      err: e,
      info: {
        id: id.toHexString(),
      },
    })
  }

  const result: stdOrClass = {}
  if (classInfo.length > 0) {
    result.id = id
    result.name = classInfo[0].name
    result.orgId = classInfo[0].users[0]._id
    result.orgName = classInfo[0].users[0].name
  }
  return result
}
