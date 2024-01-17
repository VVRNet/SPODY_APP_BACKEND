import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { JwtPairVerifyForRefresh } from '../../util/jwt'
import { ApiRoleCheckers, JwtAuthHeader, JwtAuthHeaderType } from '../authHandler'
import { RegisterApi, ResJwt, ResJwtType } from '../common'

const reqBody = Type.Object({
  refresh: Type.String({ minLength: 1, description: 'jwt refresh 토큰' }),
})
type reqBodyType = Static<typeof reqBody>

export const ApiAuthRefresh: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Headers: JwtAuthHeaderType; Body: reqBodyType; Reply: ResJwtType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['인증'],
      summary: 'jwt 토큰 리프레시',
      headers: JwtAuthHeader,
      body: reqBody,
      response: {
        200: ResJwt,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const newJwtToken = await JwtPairVerifyForRefresh({
        access: request.headers.authorization,
        refresh: request.body.refresh,
      })
      reply.send({
        access: newJwtToken.access.token,
        refresh: newJwtToken.refresh.token,
      })
    },
  })
}
