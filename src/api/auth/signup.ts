import { Static, Type } from '@fastify/type-provider-typebox'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollEmailValidate, SchemaEmailValidate } from '../../db/emailValidate'
import { CollUser } from '../../db/user'
import { ExError } from '../../util/error'
import { JwtPairGenerate } from '../../util/jwt'
import { AgreementGetLastest } from '../agreement/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import {
  EmailValidationCodeLenth,
  PasswordMinLength,
  RegisterApi,
  ResJwt,
  ResJwtType,
} from '../common'

const reqBody = Type.Object({
  email: Type.String({
    description: '가입신청 하고자 하는 메일주소',
    format: 'email',
  }),
  code: Type.String({
    description: '메일로 받은 인증코드',
    examples: ['WGDS44'],
    minLength: EmailValidationCodeLenth,
    maxLength: EmailValidationCodeLenth,
  }),
  pw: Type.String({
    description: '암호',
    examples: ['password'],
    minLength: PasswordMinLength,
  }),
  type: Type.Enum<{ student: 'std'; organization: 'org' }>(
    {
      student: 'std',
      organization: 'org',
    },
    { description: '가입 유저 종류 - std(유저),org(기관)', examples: ['std'] },
  ),
  agreement: Type.Object({
    service: Type.Optional(
      Type.Number({
        description: '동의한 서비스 약관 버전',
        minimum: 1,
      }),
    ),
    privacy: Type.Optional(
      Type.Number({
        description: '동의한 개인정보 보호방침 버전',
        minimum: 1,
      }),
    ),
    marketing: Type.Optional(
      Type.Number({
        description: '동의한 마케팅 약관 버전',
        minimum: 1,
      }),
    ),
  }),
  language: Type.Optional(
    Type.String({
      description: '약관 언어. db에 없는 언어의 경우 ko로 처리',
      examples: ['en', 'ko', 'ja'],
    }),
  ),
  deviceId: Type.Optional(Type.String({ minLength: 1, description: '푸시용 디바이스 id' })),
})
type reqBodyType = Static<typeof reqBody>

export const ApiAuthSignup: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResJwtType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['인증'],
      summary:
        '가입 flow 3 : 가입 요청. 확인된 이메일 인증코드 필요. 인증코드는 확인완료 후 1시간동안 유효. 약관은 최신버전이어야함',
      description: `[ 400에러 코드 ]
      
      . AUTH_CODE_NOTFOUND : 존재하지 않는 인증코드
      . AUTH_CODE_WRONG : 인증코드와 다른정보가 안맞음
      . AUTH_AGREEMENT_OLD : 동의한 약관버전이 최신이 아님
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResJwt,
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
        validationInfo.type !== 'signup'
      ) {
        throw new ExError('code not matched', {
          type: 'ext',
          code: 'AUTH_CODE_WRONG',
        })
      }

      // 최신약관인지 검증
      const latestAgreements = await AgreementGetLastest(request.body.language)
      for (const k in latestAgreements) {
        const type = k as keyof typeof latestAgreements
        const agreement = latestAgreements[type]
        if (agreement == null) {
          continue
        }
        const signupVersion = request.body.agreement[type] ?? -1
        if ((signupVersion > 0 || agreement.isRequired) && agreement.version > signupVersion) {
          throw new ExError('agreement version is old', {
            type: 'ext',
            code: 'AUTH_AGREEMENT_OLD',
            info: {
              agreementType: type,
              latestVersion: agreement.version,
              signupVersion: signupVersion,
            },
          })
        }
      }

      // 유저 추가
      let newUserId: ObjectId
      try {
        const now = new Date()
        const newUser = await CollUser.insertOne({
          email: request.body.email,
          password: await bcrypt.hash(request.body.pw, 10),
          type: request.body.type,
          agreement: {
            service:
              request.body.agreement.service != null
                ? { version: request.body.agreement.service, date: now }
                : undefined,
            privacy:
              request.body.agreement.privacy != null
                ? { version: request.body.agreement.privacy, date: now }
                : undefined,
            marketing:
              request.body.agreement.marketing != null
                ? { version: request.body.agreement.marketing, date: now }
                : undefined,
          },
          joinDate: now,
          signinDate: now,
          lastNotiChecked: now,
          deviceList: request.body.deviceId != null ? [request.body.deviceId] : [],
        })
        newUserId = newUser.insertedId
      } catch (e) {
        throw new ExError('fail to insert new user', {
          type: 'int',
          code: 'DB_INSERT_USER',
          err: e,
        })
      }

      // 인증코드 데이터 삭제
      try {
        await CollEmailValidate.findOneAndDelete({
          code: request.body.code,
        })
      } catch (e) {
        console.log(e)
      }

      // jwt 토큰쌍 발급
      const jwtToken = JwtPairGenerate({
        userId: newUserId.toHexString(),
        type: request.body.type,
      })

      // API 응답
      reply.send({
        access: jwtToken.access.token,
        refresh: jwtToken.refresh.token,
      })
    },
  })
}
