import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

const reqBody = Type.Object({
  deviceId: Type.Optional(Type.String({ minLength: 1, description: '푸시용 디바이스 id' })),
})
type reqBodyType = Static<typeof reqBody>

export const ApiAuthSignout: RegisterApi = (
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
      tags: ['인증'],
      summary: '로그아웃. 별도 동작은 없으나, deviceId를 요청 body로 주면 삭제처리함',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 푸시디바이스 id 삭제
      if (request.body.deviceId != null) {
        try {
          await CollUser.findOneAndUpdate(
            {
              _id: CtxUserId(request),
            },
            {
              $pull: {
                deviceList: request.body.deviceId,
              },
            },
          )
        } catch (e) {
          throw new ExError('failed to update user signin info', {
            type: 'int',
            code: 'DB_UPDATE_USER_SIGNOUT',
            err: e,
          })
        }
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
