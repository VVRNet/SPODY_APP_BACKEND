import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollKeyword } from '../../db/keyword'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue, StrToObjectId } from '../common'
import { CategoryGetFromID } from './_service'

const reqBody = Type.Object({
  categoryId: Type.String({
    description: '연결할 카테고리 id',
    minLength: 1,
  }),
  keywordId: Type.Array(
    Type.String({
      minLength: 1,
    }),
    { description: '연결할 키워드 id 배열' },
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiCategoryRelationAdd: RegisterApi = (
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
      tags: ['카테고리'],
      summary: '키워드에 카테고리 추가',
      description: `[ 400에러 코드 ]
      
      . KEYWORD_WRONG_ID : 잘못된 형식의 키워드 id가 있음
      . CATEGORY_WRONG_ID : 잘못된 형식의 카테고리 id
      . CATEGORY_NOTFOUND : 수정할 카테고리 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const categoryId = StrToObjectId(request.body.categoryId, 'CATEGORY')
      const keywordIds = request.body.keywordId.map((k) => StrToObjectId(k, 'KEYWORD'))

      // 카테고리 정보 확인
      const categoryInfo = await CategoryGetFromID(categoryId)
      if (categoryInfo == null) {
        throw new ExError('category is not existed', {
          type: 'ext',
          code: 'CATEGORY_NOTFOUND',
        })
      }

      // 키워드에 연관 데이터 추가
      try {
        await CollKeyword.updateMany(
          {
            _id: { $in: keywordIds },
          },
          {
            $addToSet: {
              category: categoryId,
            },
          },
        )
      } catch (e) {
        throw new ExError('failed to update keyword', {
          type: 'int',
          code: 'DB_UPDATE_KEYWORD',
          err: e,
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
