import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqBody = Type.Object({
  email: Type.String({ description: '확인하고자 하는 메일주소', format: 'email' }),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  userType: Type.Enum<{ student: 'std'; organization: 'org'; none: 'none' }>(
    { student: 'std', organization: 'org', none: 'none' },
    {
      description: '가입된 유저 타입(std/org). 가입되지 않은 이메일이면 none',
      examples: ['none'],
    },
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiAuthCheckMail: RegisterApi = (
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
      summary: '가입된 이메일 여부 및 가입된 유저 종류 확인',
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 이미 가입된 메일인지 검색
      let userType: 'std' | 'org' | undefined
      try {
        const user = await CollUser.findOne({
          email: request.body.email,
        })
        userType = user?.type
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

      // API 응답
      reply.send({ userType: userType ?? 'none' })
    },
  })
}
