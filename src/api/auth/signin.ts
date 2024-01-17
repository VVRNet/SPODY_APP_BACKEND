import { Static, Type } from '@fastify/type-provider-typebox'
import bcrypt from 'bcrypt'
import { FastifyInstance } from 'fastify'
import { UpdateFilter, WithId } from 'mongodb'
import { CollUser, SchemaUser } from '../../db/user'
import { ExError } from '../../util/error'
import { JwtPairGenerate } from '../../util/jwt'
import { AgreementGetLastest } from '../agreement/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { PasswordMinLength, RegisterApi } from '../common'

const reqBody = Type.Object({
  email: Type.String({ format: 'email' }),
  pw: Type.String({ minLength: PasswordMinLength }),
  deviceId: Type.Optional(Type.String({ minLength: 1, description: '푸시용 디바이스 id' })),
  language: Type.Optional(
    Type.String({
      description: '약관 언어. db에 없는 언어의 경우 ko로 처리',
      examples: ['en', 'ko', 'ja'],
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

const resBodyAgreement = Type.Optional(
  Type.Object({
    version: Type.Number({
      description: '약관 버전',
      minimum: 1,
    }),
    title: Type.String({
      description: '약관 제목',
      minLength: 1,
    }),
    content: Type.String({
      description: '약관 내용',
      minLength: 1,
    }),
    isRequired: Type.Boolean({
      description: '필수여부',
      examples: [true],
    }),
  }),
)
type resBodyAgreementType = Static<typeof resBodyAgreement>

const resBodyAgreements = Type.Object({
  service: resBodyAgreement,
  privacy: resBodyAgreement,
  marketing: resBodyAgreement,
})
type resBodyAgreementsType = Static<typeof resBodyAgreements>

const resBody = Type.Object({
  access: Type.String({ description: 'access 토큰', examples: ['eyJhbGciOi...'] }),
  refresh: Type.String({ description: 'refresh 토큰', examples: ['eyJhbGciOi...'] }),
  agreement: resBodyAgreements,
  needInfo: Type.Boolean({ description: '추가정보 필요 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiAuthSignin: RegisterApi = (
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
      summary: '로그인 요청. jwt토큰 및 신규 약관동의/추가정보 필요여부 리턴',
      description: `[ 400에러 코드 ]
      
      . AUTH_FAILED : 계정인증 실패
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 유저 검색
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

      // 로그인 일시, 푸시디바이스 id 추가
      const update: UpdateFilter<SchemaUser> = {
        $set: {
          signinDate: new Date(),
        },
      }
      if (request.body.deviceId != null) {
        update.$addToSet = {
          deviceList: request.body.deviceId,
        }
      }
      try {
        await CollUser.findOneAndUpdate(
          {
            email: request.body.email,
          },
          update,
        )
      } catch (e) {
        throw new ExError('failed to update user signin info', {
          type: 'int',
          code: 'DB_UPDATE_USER_SIGNIN',
          err: e,
          info: {
            email: request.body.email,
          },
        })
      }

      // 최신약관 가져와서 비교
      const latestAgreements = await AgreementGetLastest(request.body.language)
      const needAgreement: resBodyAgreementsType = {}
      for (const k in latestAgreements) {
        const type = k as keyof typeof latestAgreements
        const agreement = latestAgreements[type]
        if (agreement == null) {
          continue
        }
        if (agreement.version > (userInfo.agreement?.[type]?.version ?? -1)) {
          needAgreement[type] = agreement
        }
      }

      // jwt 토큰쌍 발급
      const jwtToken = JwtPairGenerate({ userId: userInfo._id.toHexString(), type: userInfo.type })

      reply.send({
        access: jwtToken.access.token,
        refresh: jwtToken.refresh.token,
        agreement: needAgreement,
        needInfo: userInfo.name == null,
      })
    },
  })
}
