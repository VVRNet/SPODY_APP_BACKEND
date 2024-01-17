import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollFollow, SchemaFollow } from '../../db/follow'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'

const reqQuery = Type.Object({
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 현황을 확인하고 싶은 반의 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  following: Type.Array(
    Type.Object({
      id: Type.String({
        description: '팔로우 대상 id',
        minLength: 1,
      }),
      name: Type.String({
        description: '팔로우 대상 이름',
        minLength: 1,
      }),
      type: Type.Enum<{ std: 'std'; class: 'class' }>(
        {
          std: 'std',
          class: 'class',
        },
        { description: '학생/반 종류 - std(학생),class(반)', examples: ['std'] },
      ),
      orgName: Type.Optional(
        Type.String({
          description: '팔로우 대상이 반일 경우, 기관 이름',
          minLength: 1,
        }),
      ),
    }),
    { description: '유저가 팔로우하고 있는 리스트' },
  ),
  followed: Type.Array(
    Type.Object({
      id: Type.String({
        description: '유저를 팔로우하는 대상 id',
        minLength: 1,
      }),
      name: Type.String({
        description: '유저를 팔로우하는 대상 이름',
        minLength: 1,
      }),
      type: Type.Enum<{ std: 'std'; class: 'class' }>(
        {
          std: 'std',
          class: 'class',
        },
        { description: '학생/반 종류 - std(학생),class(반)', examples: ['std'] },
      ),
      orgName: Type.Optional(
        Type.String({
          description: '유저를 팔로우하는 대상 반일 경우, 기관 이름',
          minLength: 1,
        }),
      ),
    }),
    { description: '유저를 팔로우하고 있는 리스트' },
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiFollowList: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['팔로우'],
      summary: '유저의 팔로우 현황 확인',
      description: `[ 400에러 코드 ]
      
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
      . CLASS_WRONG_ID : 파라미터의 반 id가 잘못됨
      . CLASS_NOTFOUND : 요청의 반이 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (request.query.classId != null) {
        classId = StrToObjectId(request.query.classId, 'CLASS')
      }

      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 유저가 팔로우하는 목록 검색
      const fileter = {
        id: userType === 'std' ? userId : classId,
        orgId: userType === 'std' ? null : userId,
      }

      let listFollowing: WithId<SchemaFollow>[] | null
      try {
        listFollowing = await CollFollow.find({
          fromId: fileter.id,
          fromOrgId: fileter.orgId as ObjectId | undefined,
        }).toArray()
      } catch (e) {
        throw new ExError('fail to get existed follow', {
          type: 'int',
          code: 'DB_GET_FOLLOW',
          err: e,
        })
      }

      // 유저를 팔로우하는 목록 검색
      let listFollowed: WithId<SchemaFollow>[] | null
      try {
        listFollowed = await CollFollow.find({
          toId: fileter.id,
          toOrgId: fileter.orgId as ObjectId | undefined,
        }).toArray()
      } catch (e) {
        throw new ExError('fail to get existed follow', {
          type: 'int',
          code: 'DB_GET_FOLLOW',
          err: e,
        })
      }

      // API 응답
      reply.send({
        following: (listFollowing ?? []).map((f) => ({
          id: f.toId.toHexString(),
          name: f.toName,
          type: f.toOrgId == null ? 'std' : 'class',
          orgName: f.toOrgId == null ? undefined : f.toOrgName,
        })),
        followed: (listFollowed ?? []).map((f) => ({
          id: f.fromId.toHexString(),
          name: f.fromName,
          type: f.fromOrgId == null ? 'std' : 'class',
          orgName: f.fromOrgId == null ? undefined : f.toOrgName,
        })),
      })
    },
  })
}
