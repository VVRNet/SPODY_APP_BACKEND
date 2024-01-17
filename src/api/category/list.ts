import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document } from 'mongodb'
import { CollCategory, SchemaCategory } from '../../db/category'
import { SchemaKeyword } from '../../db/keyword'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  page: Type.Optional(
    Type.Number({
      minimum: 1,
      description: '몇페이지에 해당하는 내용인지. 1부터 시작 - 주어지는값이 없으면 1로 간주',
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({
      minimum: 1,
      description: '페이지 당 건수. - 주어지는값이 없으면 10으로 간주',
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  list: Type.Array(
    Type.Object({
      id: Type.String(),
      trans: Type.Array(Type.Object({ language: Type.String(), word: Type.String() })),
      keywords: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.Optional(Type.String()),
            trans: Type.Array(Type.Object({ language: Type.String(), word: Type.String() })),
          }),
        ),
      ),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 문서 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiCategoryList: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: `${url}`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['카테고리'],
      summary: '카테고리 리스트',
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const param = request.query

      const pageSize = param.pageSize ?? 10
      const pageSkipCount = ((param.page ?? 1) - 1) * pageSize

      const pipelines: Document[] = [
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [
              { $skip: pageSkipCount },
              { $limit: pageSize },
              {
                $lookup: {
                  from: 'keyword',
                  localField: '_id',
                  foreignField: 'category',
                  as: 'keywords',
                },
              },
            ],
          },
        },
        {
          $project: {
            result: '$data',
            total: { $arrayElemAt: ['$metadata.total', 0] },
          },
        },
      ]

      type categoryWithKeywords = {
        result: (SchemaCategory & { keywords?: SchemaKeyword[] })[]
        total?: number
      }
      let categories: categoryWithKeywords
      try {
        categories = (await CollCategory.aggregate<categoryWithKeywords>(pipelines).toArray())[0]
      } catch (e) {
        throw new ExError('failed to get category list', {
          type: 'int',
          code: 'DB_FIND_CATEGORY',
          err: e,
        })
      }

      // API 응답
      reply.send({
        total: categories.total ?? 0,
        last: (categories.total ?? 0) - pageSkipCount <= pageSize,
        list: categories.result.map((q) => ({
          id: q._id!.toHexString(),
          trans: q.trans,
          keywords: q.keywords?.map((k) => ({
            id: k._id?.toHexString(),
            trans: k.trans,
          })),
        })),
      })
    },
  })
}
