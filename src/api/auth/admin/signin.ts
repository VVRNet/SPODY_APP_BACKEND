import { Static, Type } from '@fastify/type-provider-typebox'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollAdmin, SchemaAdmin } from '../../../db/admin'
import { ExError } from '../../../util/error'
import { JwtPairGenerate } from '../../../util/jwt'
import { ApiRoleCheckers, JwtAuthHeader } from '../../authHandler'
import { PasswordMinLength, RegisterApi } from '../../common'

const reqBody = Type.Object({
  email: Type.String({ format: 'email' }),
  pw: Type.String({ minLength: PasswordMinLength }),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  access: Type.String({ description: 'access 토큰', examples: ['eyJhbGciOi...'] }),
  refresh: Type.String({ description: 'refresh 토큰', examples: ['eyJhbGciOi...'] }),
})
type resBodyType = Static<typeof resBody>

export const ApiAuthAdminSignin: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: resBodyType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['인증'],
      summary: '[관리자용] 로그인 요청. jwt토큰 리턴',
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 유저 검색
      let userInfo: WithId<SchemaAdmin> | null = null
      try {
        userInfo = await CollAdmin.findOne({
          email: request.body.email,
        })
      } catch (e) {
        throw new ExError('failed to get user', {
          type: 'int',
          code: 'DB_GET_USER',
          err: e,
          info: {
            email: request.body.email,
          },
        })
      }
      if (userInfo == null) {
        throw new ExError('email not existed', {
          type: 'ext',
          code: 'AUTH_FAILED',
        })
      }

      // 암호 검증
      const isPasswordValid = await bcrypt.compare(request.body.pw, userInfo.password)
      if (!isPasswordValid) {
        throw new ExError('password wrong', {
          type: 'ext',
          code: 'AUTH_FAILED',
        })
      }

      // jwt 토큰쌍 발급
      const jwtToken = JwtPairGenerate({ userId: userInfo._id.toHexString(), type: 'admin' })

      reply.send({
        access: jwtToken.access.token,
        refresh: jwtToken.refresh.token,
      })
    },
  })
}
