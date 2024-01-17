import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollSubject, SchemaSubject } from '../../db/subject'
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

const reqBody = Type.Object({
  subjectId: Type.String({
    description: '과목 id',
    minLength: 1,
  }),
  favorite: Type.Boolean({
    description: '관심 과목 여부',
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반의 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiSubjectUpdateFavorite: RegisterApi = (
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
      tags: ['과목'],
      summary: '과목 관심여부 업데이트',
      description: `[ 400에러 코드 ]
      
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
      . SUBJECT_WRONG_ID : 잘못된 형식의 대상 id
      . SUBJECT_NOTFOUND : 업데이트할 과목 정보를 찾지 못함
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 요청의 반이 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      const targetId = StrToObjectId(request.body.subjectId, 'SUBJECT')
      let classId: ObjectId | undefined
      if (request.body.classId != null) {
        classId = StrToObjectId(request.body.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 과목 업데이트
      let updateResult: WithId<SchemaSubject> | null = null
      try {
        updateResult = await CollSubject.findOneAndUpdate(
          {
            _id: targetId,
            userId: userType === 'std' ? userId : classId,
            userType: userType === 'std' ? 'std' : 'class',
          },
          {
            $set: {
              favorite: request.body.favorite,
            },
          },
          { returnDocument: 'after' },
        )
      } catch (e) {
        throw new ExError('fail to update subject', {
          type: 'int',
          code: 'DB_UPDATE_SUBJECT',
          err: e,
        })
      }

      // 업데이트 결과 확인
      if (updateResult == null) {
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
