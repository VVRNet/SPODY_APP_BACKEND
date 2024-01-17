import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollEmailValidate } from '../../db/emailValidate'
import { CollUser, SchemaUser } from '../../db/user'
import { AwsSesSendEmail } from '../../util/awsSes'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import {
  EmailCodeLiveTimeMinReady,
  EmailSender,
  EmailValidationCodeGenerate,
  RegisterApi,
} from '../common'

const reqBody = Type.Object({
  email: Type.String({ description: '가입신청 및 인증코드 받고자 하는 메일주소', format: 'email' }),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  expireAt: Type.Number({
    description: '인증 만료시간 (unix time 초단위)',
    examples: [1689013812],
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiAuthSignupMailReq: RegisterApi = (
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
      summary: '가입 flow 1 : 검증코드 이메일 발송 요청. 인증코드는 10분간 유효',
      description: `[ 400에러 코드 ]
      
      . AUTH_EMAIL_EXITED : 이미 존재하는 계정
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 이미 가입된 메일인지 검색
      let userInfo: WithId<SchemaUser> | null = null
      try {
        userInfo = await CollUser.findOne({
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
      if (userInfo != null) {
        throw new ExError('email already existed', {
          type: 'ext',
          code: 'AUTH_EMAIL_EXITED',
        })
      }

      let validationCode: string
      let expireAt: Date

      // 인증코드 및 만료시간 생성
      while (true) {
        validationCode = EmailValidationCodeGenerate()
        expireAt = new Date(new Date().getTime() + EmailCodeLiveTimeMinReady * 60000)
        // DB 인증정보 추가
        try {
          await CollEmailValidate.insertOne({
            email: request.body.email,
            code: validationCode,
            expireAt: expireAt,
            status: 'ready',
            type: 'signup',
          })
          break
        } catch (e: any) {
          if (
            typeof e.message !== 'string' ||
            !(e.message as string).includes('duplicate key error')
          ) {
            throw e
          }
        }
      }

      // 이메일 전송
      await AwsSesSendEmail(
        request.body.email,
        EmailSender,
        '스포디 가입인증코드 안내',
        `인증코드는 ${validationCode} 입니다`,
      )

      // API 응답
      reply.send({ expireAt: Math.round(expireAt.getTime() / 1000) })
    },
  })
}
