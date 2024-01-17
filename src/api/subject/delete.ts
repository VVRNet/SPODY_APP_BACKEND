import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { DeleteResult, ObjectId } from 'mongodb'
import { CollSubject } from '../../db/subject'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'

const reqQuery = Type.Object({
  subjectId: Type.String({
    description: '삭제 대상 과목 id',
    minLength: 1,
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반의 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

export const ApiSubjectDelete: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: ResOkType }>({
    method: 'delete',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['과목'],
      summary: '과목 삭제',
      description: `[ 400에러 코드 ]
      
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
      . SUBJECT_WRONG_ID : 잘못된 형식의 대상 id
      . SUBJECT_NOTFOUND : 삭제할 과목 정보를 찾지 못함
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 요청의 반이 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      const targetId = StrToObjectId(request.query.subjectId, 'SUBJECT')
      let classId: ObjectId | undefined
      if (request.query.classId != null) {
        classId = StrToObjectId(request.query.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 과목 삭제
      let deleteResult: DeleteResult
      try {
        deleteResult = await CollSubject.deleteOne({
          _id: targetId,
          userId: userType === 'std' ? userId : classId,
          userType: userType === 'std' ? 'std' : 'class',
        })
      } catch (e) {
        throw new ExError('fail to delete subject', {
          type: 'int',
          code: 'DB_DELETE_SUBJECT',
          err: e,
        })
      }

      // 삭제 결과 확인
      if (deleteResult.deletedCount < 1) {
        throw new ExError('subject not found', {
          type: 'ext',
          code: 'SUBJECT_NOTFOUND',
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
