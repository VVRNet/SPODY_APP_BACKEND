import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document, ObjectId, WithId } from 'mongodb'
import { CollCategory, SchemaCategory } from '../../db/category'
import { SchemaKeyword } from '../../db/keyword'
import { CollQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  category: Type.Optional(
    Type.Array(
      Type.String({
        description: '카테고리명, 요청의 언어와 맞아야함',
        minLength: 1,
        examples: ['운동'],
      }),
    ),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  list: Type.Array(
    Type.Object({
      id: Type.String({ description: '과목명 id' }),
      keyword: Type.String({ description: '과목명, 요청의 언어에 맞춘 번역문자열로 줌' }),
      category: Type.Optional(
        Type.String({ description: '카테고리명, 요청의 언어에 맞춘 번역문자열로 줌' }),
      ),
    }),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiQuizKeywordRecommend: RegisterApi = (
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
      tags: ['퀴즈'],
      summary: '문제은행 검색을 위한 추천 과목명 요청. 많이 쓰이는 과명명순으로 응답',
      description: ``,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const requestQuery = request.query

      // 요청과 동일한 카테고리가 존재하는지 확인
      let categoryInfos: WithId<SchemaCategory>[] | undefined = undefined
      if (requestQuery.category != null) {
        try {
          categoryInfos = await CollCategory.find({
            trans: {
              $elemMatch: { language: requestQuery.language, word: { $in: requestQuery.category } },
            },
          }).toArray()
        } catch (e) {
          throw new ExError('failed to category', {
            type: 'int',
            code: 'DB_FIND_KEYWORD',
            err: e,
          })
        }

        if (categoryInfos.length < 1) {
          throw new ExError('category is not existed', {
            type: 'ext',
            code: 'CATEGORY_NOTFOUND',
          })
        }
      }

      // 퀴즈 검색
      type keywordFromQuiz = {
        _id: ObjectId
        keywordId: ObjectId
        categoryId: ObjectId
        count: number
        keywords: SchemaKeyword[]
        categories: SchemaCategory[]
      }
      let result: keywordFromQuiz[]
      try {
        const aggregate: Document[] =
          categoryInfos == null
            ? []
            : [
                {
                  $match: {
                    categoryId: { $in: categoryInfos.map((c) => c._id) },
                  },
                },
              ]
        result = await CollQuiz.aggregate<keywordFromQuiz>(
          aggregate.concat(
            [
              { $sample: { size: 500 } }, // 적절한 샘플 크기로 조정
              {
                $group: {
                  _id: '$keywordId',
                  keywordId: { $first: '$keywordId' },
                  categoryId: { $first: '$categoryId' },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
              {
                $lookup: {
                  from: 'keyword',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'keywords',
                },
              },
            ].concat(
              categoryInfos == null
                ? []
                : [
                    {
                      $lookup: {
                        from: 'category',
                        localField: 'categoryId',
                        foreignField: '_id',
                        as: 'categories',
                      },
                    },
                  ],
            ),
          ),
        ).toArray()
      } catch (e) {
        throw new ExError('failed to get quiz keyword list', {
          type: 'int',
          code: 'DB_FIND_QUIZ_KEYWORD',
          err: e,
        })
      }

      // API 응답
      reply.send({
        list: result.map((k) => ({
          id: k._id.toHexString(),
          keyword:
            (
              k.keywords[0].trans.find((t) => t.language === requestQuery.language) ??
              k.keywords[0].trans.find((t) => t.language === 'en')
            )?.word ?? '',
          category:
            categoryInfos == null
              ? undefined
              : (
                  k.categories[0].trans.find((t) => t.language === requestQuery.language) ??
                  k.categories[0].trans.find((t) => t.language === 'en')
                )?.word ?? '',
        })),
      })
    },
  })
}
