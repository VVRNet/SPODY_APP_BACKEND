import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollUserFindId, SchemaUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  findId: Type.String({
    description: '검색id',
    minLength: 1,
  }),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  canUse: Type.Boolean({
    description: '사용가능 여부',
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiUserCheckFindId: RegisterApi = (
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
      summary: '유저 검색 id가 사용가능한지 체크해줌.',
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      let existedFindId: WithId<SchemaUserFindId> | null = null
      try {
        existedFindId = await CollUserFindId.findOne({ name: request.query.findId })
      } catch (e) {
        throw new ExError('fail to search findID', {
          type: 'int',
          code: 'DB_USER_FINDID',
          err: e,
        })
      }

      reply.send({ canUse: existedFindId == null })
    },
  })
}
