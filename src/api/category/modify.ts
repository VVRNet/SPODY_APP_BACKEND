import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollCategory } from '../../db/category'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue, StrToObjectId } from '../common'
import { CategoryGetFromID } from './_service'

const reqParam = Type.Object({
  categoryId: Type.String({
    description: '변경할 카테고리 id',
    minLength: 1,
  }),
})
type reqParamType = Static<typeof reqParam>

const reqBody = Type.Object({
  ko: Type.Optional(
    Type.String({
      description: '한국어',
      minLength: 1,
    }),
  ),
  en: Type.Optional(
    Type.String({
      description: '영어',
      minLength: 1,
    }),
  ),
  ja: Type.Optional(
    Type.String({
      description: '일본어',
      minLength: 1,
    }),
  ),
  zh: Type.Optional(
    Type.String({
      description: '중국어',
      minLength: 1,
    }),
  ),
  es: Type.Optional(
    Type.String({
      description: '스페인어',
      minLength: 1,
    }),
  ),
  fi: Type.Optional(
    Type.String({
      description: '핀란드어',
      minLength: 1,
    }),
  ),
  fr: Type.Optional(
    Type.String({
      description: '프랑스어',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiCategoryModify: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Params: reqParamType; Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: `${url}/:categoryId`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['카테고리'],
      summary: '카테고리 변경',
      description: `[ 400에러 코드 ]
      
      . CATEGORY_WRONG_ID : 잘못된 형식의 카테고리 id
      . CATEGORY_NOTFOUND : 수정할 카테고리 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      params: reqParam,
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const requestBody = request.body
      const categoryId = StrToObjectId(request.params.categoryId, 'CATEGORY')

      // 카테고리 정보 확인
      const categoryInfo = await CategoryGetFromID(categoryId)
      if (categoryInfo == null) {
        throw new ExError('category is not existed', {
          type: 'ext',
          code: 'CATEGORY_NOTFOUND',
        })
      }

      // 카테고리 추가
      try {
        await CollCategory.findOneAndUpdate(
          {
            _id: categoryId,
          },
          {
            $set: {
              trans: [
                {
                  language: 'ko',
                  word: requestBody.ko ?? categoryInfo.trans.find((t) => t.language === 'ko')!.word,
                },
                {
                  language: 'en',
                  word: requestBody.en ?? categoryInfo.trans.find((t) => t.language === 'en')!.word,
                },
                {
                  language: 'ja',
                  word: requestBody.ja ?? categoryInfo.trans.find((t) => t.language === 'ja')!.word,
                },
                {
                  language: 'zh',
                  word: requestBody.zh ?? categoryInfo.trans.find((t) => t.language === 'zh')!.word,
                },
                {
                  language: 'es',
                  word: requestBody.es ?? categoryInfo.trans.find((t) => t.language === 'es')!.word,
                },
                {
                  language: 'fi',
                  word: requestBody.fi ?? categoryInfo.trans.find((t) => t.language === 'fi')!.word,
                },
                {
                  language: 'fr',
                  word: requestBody.fr ?? categoryInfo.trans.find((t) => t.language === 'fr')!.word,
                },
              ],
            },
          },
        )
      } catch (e) {
        throw new ExError('failed to update category', {
          type: 'int',
          code: 'DB_UPDATE_CATEGORY',
          err: e,
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
