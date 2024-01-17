import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { CollCategory } from '../../db/category'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqBody = Type.Object({
  ko: Type.String({
    description: '한국어',
    minLength: 1,
  }),
  en: Type.String({
    description: '영어',
    minLength: 1,
  }),
  ja: Type.String({
    description: '일본어',
    minLength: 1,
  }),
  zh: Type.String({
    description: '중국어',
    minLength: 1,
  }),
  es: Type.String({
    description: '스페인어',
    minLength: 1,
  }),
  fi: Type.String({
    description: '핀란드어',
    minLength: 1,
  }),
  fr: Type.String({
    description: '프랑스어',
    minLength: 1,
  }),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  categoryId: Type.String({
    description: '만들어진 카테고리 id',
    examples: ['64ad90e45aaeb63c51a82307'],
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiCategoryAdd: RegisterApi = (
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
      tags: ['카테고리'],
      summary: '카테고리 추가',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const requestBody = request.body
      // 카테고리 추가
      let newCategoryId: ObjectId
      try {
        const newCategory = await CollCategory.insertOne({
          trans: [
            { language: 'ko', word: requestBody.ko },
            { language: 'en', word: requestBody.en },
            { language: 'ja', word: requestBody.ja },
            { language: 'zh', word: requestBody.zh },
            { language: 'es', word: requestBody.es },
            { language: 'fi', word: requestBody.fi },
            { language: 'fr', word: requestBody.fr },
          ],
        })
        newCategoryId = newCategory.insertedId
      } catch (e) {
        throw new ExError('failed to insert category', {
          type: 'int',
          code: 'DB_INSERT_CATEGORY',
          err: e,
        })
      }

      // API 응답
      reply.send({ categoryId: newCategoryId.toHexString() })
    },
  })
}
