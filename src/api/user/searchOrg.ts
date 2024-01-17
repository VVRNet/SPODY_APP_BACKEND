import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { SchemaClass } from '../../db/class'
import { CollUser, SchemaUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, CtxUserType, RegisterApi } from '../common'

const reqQuery = Type.Object({
  name: Type.String({
    description: '기관 이름. 텍스트 부분검색',
    minLength: 1,
  }),
})
type reqQueryType = Static<typeof reqQuery>

const resBodyItem = Type.Object({
  id: Type.String({
    description: '기관의 id',
  }),
  name: Type.String({
    description: '기관의 이름',
  }),
  address: Type.String({
    description: '기관의 주소',
  }),
  class: Type.Array(
    Type.Object({
      id: Type.String({ description: '반 id' }),
      name: Type.String({ description: '반 이름', examples: ['a반'] }),
    }),
    { description: '보유 반 리스트' },
  ),
})
type resBodyItemType = Static<typeof resBodyItem>

const resBody = Type.Object({
  list: Type.Array(resBodyItem, {
    description: '검색된 학생/반 목록. 없으면 빈배열로 응답',
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiUserSearchOrg: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: `${url}`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['유저'],
      summary: '유저/반 검색. 요청 내용이 이름에 포함된 학생/반 목록을 응답. 없을경우 빈배열 리턴',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      type userWithClass = SchemaUser & { class: SchemaClass[] }
      let orgInfoWithClass: userWithClass[]
      try {
        orgInfoWithClass = await CollUser.aggregate<userWithClass>([
          {
            $match: {
              type: 'org',
              name: { $regex: request.query.name },
            },
          },
          {
            $lookup: {
              from: 'class',
              localField: '_id',
              foreignField: 'userId',
              as: 'class',
            },
          },
        ]).toArray()
      } catch (e) {
        throw new ExError('failed to search org with class', {
          type: 'int',
          code: 'DB_SEARCH_ORG',
          err: e,
          info: {
            name: request.query.name,
          },
        })
      }

      // 현재 유저는 결과에서 제외
      const userId = CtxUserId(request)
      if (orgInfoWithClass.length > 0 && CtxUserType(request) === 'org') {
        orgInfoWithClass = orgInfoWithClass.filter((o) => o._id !== userId)
      }

      // API 응답
      reply.send({
        list: orgInfoWithClass.map((o) => ({
          id: o._id?.toHexString() ?? '',
          name: o.name ?? '',
          address: o.address1 ?? '',
          class: o.class.map((c) => ({ id: c._id?.toHexString() ?? '', name: c.name })),
        })),
      })
    },
  })
}
