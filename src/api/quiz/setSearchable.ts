import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue, StrToObjectId } from '../common'

const reqBody = Type.Object({
  quizId: Type.String({
    description: '퀴즈 id',
  }),
  searchable: Type.Boolean({
    description: '퀴즈 검색활성화 여부',
  }),
})
type reqBodyType = Static<typeof reqBody>

export const ApiQuizSetSearchable: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: `${url}`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['퀴즈'],
      summary: '퀴즈 검색 활성화 여부 변경. 어드민만 가능해야하나, 모든 유저가 가능하게 임시 오픈',
      description: `[ 400에러 코드 ]

      . QUIZ_WRONG_ID : 요청 내 quiz id 형식이 잘못됨
      . QUIZ_NOTFOUND : 요청 내 quiz 가 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const requestBody = request.body

      const quizId = StrToObjectId(requestBody.quizId, 'QUIZ')
      let isQuizExisted = false
      // 문제 DB 수정
      try {
        const updateResult = await CollQuiz.updateOne(
          { _id: quizId },
          {
            $set: {
              isSearchable: requestBody.searchable,
            },
          },
        )
        isQuizExisted = updateResult.matchedCount > 0
      } catch (e) {
        throw new ExError('failed to update quiz', {
          type: 'int',
          code: 'DB_UPDATE_QUIZ',
          err: e,
        })
      }

      if (!isQuizExisted) {
        throw new ExError('quiz not existed', {
          type: 'ext',
          code: 'QUIZ_NOTFOUND',
        })
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
