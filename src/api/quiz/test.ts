import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { SlackSendMessage } from '../../util/slack'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

// const reqParam = Type.Object({
//   quizId: Type.String({
//     description: '퀴즈 id',
//     minLength: 1,
//   }),
// })
// type reqParamType = Static<typeof reqParam>

// 파일 업로드에 대한 스키마 정의
const reqBodyFile = Type.Object({
  // encoding: Type.String(),
  filename: Type.String(),
  // mimetype: Type.String(),
  data: Type.Any(), // Buffer
  // type: Type.Optional(Type.String()),
})

const reqBody = Type.Object({
  uploadImages: Type.Optional(
    Type.Array(reqBodyFile, {
      maxItems: 40,
      description: '변경되는 파일 업로드. swagger로는 테스트 불가',
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiQuizTest: RegisterApi = (
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
      summary: '업로드 테스트!!',
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const param = request.body

      // 이미지 업로드 처리
      if (param.uploadImages != null) {
        for (const i of param.uploadImages) {
          SlackSendMessage(`${i.filename} / ${i.data}`)
        }
      }

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
