import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollCategory, SchemaCategory } from '../../db/category'
import { CollKeyword } from '../../db/keyword'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue, StrToObjectId } from '../common'

const reqParam = Type.Object({
  categoryId: Type.String({
    description: '삭제할 카테고리 id',
    minLength: 1,
  }),
})
type reqParamType = Static<typeof reqParam>

export const ApiCategoryDelete: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Params: reqParamType; Reply: ResOkType }>({
    method: 'delete',
    url: `${url}/:categoryId`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['카테고리'],
      summary: '카테고리 삭제',
      description: `[ 400에러 코드 ]
      
      . CATEGORY_WRONG_ID : 잘못된 형식의 카테고리 id
      . CATEGORY_NOTFOUND : 수정할 카테고리 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      params: reqParam,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const categoryId = StrToObjectId(request.params.categoryId, 'CATEGORY')

      // 카테고리 삭제
      let deleteResult: WithId<SchemaCategory> | null = null
      try {
        deleteResult = await CollCategory.findOneAndDelete({
          _id: categoryId,
        })
      } catch (e) {
        throw new ExError('failed to delete category', {
          type: 'int',
          code: 'DB_DELETE_CATEGORY',
          err: e,
          info: {
            categoryId: categoryId.toHexString(),
          },
        })
      }

      // 삭제 결과 확인
      if (deleteResult == null) {
        throw new ExError('wrong category id', {
          type: 'ext',
          code: 'CATEGORY_NOTFOUND',
        })
      }

      // 연관 데이터 삭제
      try {
        await CollKeyword.updateMany(
          {
            category: { $in: [categoryId] },
          },
          {
            $pull: {
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
