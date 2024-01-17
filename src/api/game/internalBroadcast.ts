import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Env } from '../../util/env'
import { ExError } from '../../util/error'
import { IpManagerClusterIps } from '../../util/ipManager'
import { WebsocketBroadcast } from '../../websocket/_service'
import { ApiRoleCheckers } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

const reqBody = Type.Object({
  users: Type.Array(
    Type.Object({
      userId: Type.String(),
      userType: Type.Enum<{ std: 'std'; class: 'class' }>({
        std: 'std',
        class: 'class',
      }),
    }),
  ),
  message: Type.String(),
})
type reqBodyType = Static<typeof reqBody>

export const ApiGameInternalBroadcast: RegisterApi = (
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
      hide: true,
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      if (
        Env().env !== 'local' &&
        !IpManagerClusterIps().includes(request.ip) &&
        !IpManagerClusterIps().some((ip) => request.ips?.includes(ip) ?? false)
      ) {
        throw new ExError('wrong access', {
          type: 'ext',
          code: 'WRONG_ACCESS',
        })
      }
      await WebsocketBroadcast(
        request.body.users.map((u) => ({ id: u.userId, type: u.userType })),
        request.body.message,
        false,
      )

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
