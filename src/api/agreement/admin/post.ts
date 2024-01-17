import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollAgreement } from '../../../db/agreement'
import { ExError } from '../../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../../authHandler'
import { RegisterApi } from '../../common'

const reqBody = Type.Object({
  type: Type.Enum<{ service: 'service'; privacy: 'privacy'; marketing: 'marketing' }>(
    {
      service: 'service',
      privacy: 'privacy',
      marketing: 'marketing',
    },
    {
      description: '약관 종류 - service(서비스),privacy(개인정보),marketing(마케팅)',
      examples: ['service'],
    },
  ),
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
  language: Type.String({
    description: '약관의 언어. 언어코드',
    examples: ['en', 'ko', 'ja'],
  }),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  version: Type.Number({
    description: '발행된 약관 버전 (발행일시)',
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiAgreementPost: RegisterApi = (
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
      tags: ['약관'],
      summary: '[관리자용] 약관 등록',
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
      const newVersion = parseInt(
        [
          now.getFullYear().toString().slice(-2),
          (now.getMonth() + 1).toString().padStart(2, '0'),
          now.getDate().toString().padStart(2, '0'),
          now.getHours().toString().padStart(2, '0'),
          now.getMinutes().toString().padStart(2, '0'),
        ].join(''),
      )

      try {
        await CollAgreement.insertOne({
          type: request.body.type,
          title: request.body.title,
          content: request.body.content,
          isRequired: request.body.isRequired,
          version: newVersion,
          language: request.body.language,
        })
      } catch (e) {
        throw new ExError('failed to insert agreement', {
          type: 'int',
          code: 'DB_INSERT_AGREEMENT',
          err: e,
        })
      }

      reply.send({ version: newVersion })
    },
  })
}
