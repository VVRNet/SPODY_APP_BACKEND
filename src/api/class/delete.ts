import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { DeleteResult } from 'mongodb'
import { CollClass } from '../../db/class'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi, ResOk, ResOkType, ResOkValue, StrToObjectId } from '../common'

const reqParam = Type.Object({
  classId: Type.String({
    description: '삭제할 반 id',
    minLength: 1,
  }),
})
type reqParamType = Static<typeof reqParam>

export const ApiClassDelete: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Params: reqParamType; Reply: ResOkType }>({
    method: 'delete',
    url: `${url}/:classId`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['반 (기관 전용)'],
      summary: '반 삭제',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 삭제할 반을 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      params: reqParam,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 파라미터 objectID 변환
      const classId = StrToObjectId(request.params.classId, 'CLASS')

      // 반 삭제
      let deleteResult: DeleteResult
      try {
        deleteResult = await CollClass.deleteOne({
          _id: classId,
          userId: CtxUserId(request),
        })
      } catch (e) {
        throw new ExError('failed to delete class', {
          type: 'int',
          code: 'DB_DELETE_CLASS',
          err: e,
          info: {
            userId: classId.toHexString(),
          },
        })
      }

      // TODO: 팔로우에서 반 삭제

      // 삭제 결과 확인
      if (deleteResult.deletedCount < 1) {
        throw new ExError('wrong class id', {
          type: 'ext',
          code: 'CLASS_NOTFOUND',
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
