import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { DeleteResult, ObjectId } from 'mongodb'
import { CollFollow } from '../../db/follow'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'

const reqQuery = Type.Object({
  targetId: Type.String({
    description: '팔로우 대상 id',
    minLength: 1,
  }),
  targetType: Type.Enum<{ std: 'std'; class: 'class' }>(
    {
      std: 'std',
      class: 'class',
    },
    { description: '팔로우 대상 학생/반 종류 - std(학생),class(반)', examples: ['std'] },
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 현황을 확인하고 싶은 반의 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

export const ApiFollowDelete: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: ResOkType }>({
    method: 'delete',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['팔로우'],
      summary: '팔로우 취소 요청',
      description: `[ 400에러 코드 ]
      
      . FOLLOW_WRONG_ID : 잘못된 형식의 대상 id
      . FOLLOW_NOTFOUND : 삭제할 팔로우 정보를 찾지 못함
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 요청의 반이 존재하지 않음
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      const targetId = StrToObjectId(request.query.targetId, 'FOLLOW')
      let classId: ObjectId | undefined
      if (request.query.classId != null) {
        classId = StrToObjectId(request.query.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 팔로우 관계 삭제
      let deleteResult: DeleteResult
      try {
        deleteResult = await CollFollow.deleteOne({
          fromId: userType === 'std' ? userId : classId,
          toId: targetId,
          fromOrgId: (userType === 'std' ? null : userId) as any,
          toOrgId: (request.query.targetType === 'class' ? { $ne: null } : null) as any,
        })
      } catch (e) {
        throw new ExError('fail to delete follow', {
          type: 'int',
          code: 'DB_DELETE_FOLLOW',
          err: e,
        })
      }

      // 삭제 결과 확인
      if (deleteResult.deletedCount < 1) {
        throw new ExError('wrong class id', {
          type: 'ext',
          code: 'FOLLOW_NOTFOUND',
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
