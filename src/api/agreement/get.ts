import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'
import { AgreementGetLastest } from './_service'

const reqQuery = Type.Object({
  language: Type.Optional(
    Type.String({
      description: '약관 언어. db에 없는 언어의 경우 ko로 처리',
      examples: ['en', 'ko', 'ja'],
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  service: Type.Optional(
    Type.Object(
      {
        version: Type.Number({
          description: '약관 버전',
          minimum: 1,
        }),
        title: Type.String({
          description: '약관 제목',
          minLength: 1,
        }),
        contents: Type.String({
          description: '약관 내용',
          minLength: 1,
        }),
        isRequired: Type.Boolean({
          description: '필수여부',
          examples: [true],
        }),
      },
      { description: '신규 서비스 약관 정보' },
    ),
  ),
  privacy: Type.Optional(
    Type.Object(
      {
        version: Type.Number({
          description: '약관 버전',
          minimum: 1,
        }),
        title: Type.String({
          description: '약관 제목',
          minLength: 1,
        }),
        contents: Type.String({
          description: '약관 내용',
          minLength: 1,
        }),
        isRequired: Type.Boolean({
          description: '필수여부',
          examples: [true],
        }),
      },
      { description: '개인정보 보호방침 정보' },
    ),
  ),
  marketing: Type.Optional(
    Type.Object(
      {
        version: Type.Number({
          description: '약관 버전',
          minimum: 1,
        }),
        title: Type.String({
          description: '약관 제목',
          minLength: 1,
        }),
        contents: Type.String({
          description: '약관 내용',
          minLength: 1,
        }),
        isRequired: Type.Boolean({
          description: '필수여부',
          examples: [true],
        }),
      },
      { description: '신규 마케팅 약관 정보' },
    ),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiAgreementGet: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['약관'],
      summary: '최신약관 정보 요청',
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const latestAggrements = await AgreementGetLastest(request.query.language)
      reply.send({
        service:
          latestAggrements.service == null
            ? undefined
            : {
                version: latestAggrements.service.version,
                title: latestAggrements.service.title,
                contents: latestAggrements.service.content,
                isRequired: latestAggrements.service.isRequired,
              },
        privacy:
          latestAggrements.privacy == null
            ? undefined
            : {
                version: latestAggrements.privacy.version,
                title: latestAggrements.privacy.title,
                contents: latestAggrements.privacy.content,
                isRequired: latestAggrements.privacy.isRequired,
              },
        marketing:
          latestAggrements.marketing == null
            ? undefined
            : {
                version: latestAggrements.marketing.version,
                title: latestAggrements.marketing.title,
                contents: latestAggrements.marketing.content,
                isRequired: latestAggrements.marketing.isRequired,
              },
      })
    },
  })
}
