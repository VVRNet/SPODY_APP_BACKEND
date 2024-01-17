import { Static, Type } from '@fastify/type-provider-typebox'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollEmailValidate, SchemaEmailValidate } from '../../db/emailValidate'
import { CollUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import {
  EmailValidationCodeLenth,
  PasswordMinLength,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
} from '../common'

const reqBody = Type.Object({
  email: Type.String({ description: '가입신청 하고자 하는 메일주소', format: 'email' }),
  code: Type.String({
    description: '메일로 받은 인증코드',
    examples: ['WGDS44'],
    minLength: EmailValidationCodeLenth,
    maxLength: EmailValidationCodeLenth,
  }),
  pw: Type.String({
    description: '초기화 하고자 하는 암호',
    examples: ['password'],
    minLength: PasswordMinLength,
  }),
})
type reqBodyType = Static<typeof reqBody>

export const ApiAuthPwChange: RegisterApi = (
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
      summary: '암호초기화 flow 3 : 패스워드 초기화. 인증코드는 확인완료 후 1시간동안 유효',
      description: `[ 400에러 코드 ]
      
      . AUTH_CODE_NOTFOUND : 존재하지 않는 인증코드
      . AUTH_CODE_WRONG : 인증코드와 다른정보가 안맞음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 인증 코드 검색
      let validationInfo: WithId<SchemaEmailValidate> | null
      try {
        validationInfo = await CollEmailValidate.findOne({
          code: request.body.code,
        })
      } catch (e) {
        throw new ExError('failed to get code', {
          type: 'int',
          code: 'DB_GET_CODE',
          err: e,
          info: {
            email: request.body.code,
          },
        })
      }
      if (validationInfo == null) {
        throw new ExError('code not existed', {
          type: 'ext',
          code: 'AUTH_CODE_NOTFOUND',
        })
      }

      // 인증 코드 데이터 검증
      if (
        validationInfo.email !== request.body.email ||
        validationInfo.status !== 'confirm' ||
        validationInfo.type !== 'password'
      ) {
        throw new ExError('code not matched', {
          type: 'ext',
          code: 'AUTH_CODE_WRONG',
        })
      }

      // 유저 암호 업데이트
      try {
        await CollUser.findOneAndUpdate(
          {
            email: request.body.email,
          },
          {
            $set: {
              password: await bcrypt.hash(request.body.pw, 10),
            },
          },
        )
      } catch (e) {
        throw e
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
