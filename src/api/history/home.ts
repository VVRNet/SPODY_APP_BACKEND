import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { CollHistory } from '../../db/history'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'

const reqQuery = Type.Object({
  year: Type.Number({
    description: '학습현황에 사용할 년도',
    examples: [2023],
  }),
  month: Type.Number({
    description: '학습현황에 사용할 월 (1~12)',
    minimum: 1,
    maximum: 12,
    examples: [1],
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  quizCountAll: Type.Number({ description: '총 푼 문제 수 (전체기간)' }),
  quizCount: Type.Number({ description: '총 푼 문제 수' }),
  ageLearn: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
  ageCognative: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
  ageActivity: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryHome: RegisterApi = (
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
      tags: ['기록'],
      summary: '기록 종합 조회 - 홈화면에서 사용, 주어진 년/월에 해당하는 통계를 알려줌',
      description: `[ 400에러 코드 ]

      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const query = request.query

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (query.classId != null) {
        classId = StrToObjectId(query.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      // 총 푼 문제 개수 찾기
      const allCount = await CollHistory.countDocuments({
        $expr: {
          $and: [
            { $eq: ['$userId', userId] },
            { $eq: ['$userType', classId != null ? 'class' : 'std'] },
          ],
        },
      })

      // 필요한 통계 계산
      type monthlySummeryType = {
        count: number
        ageLearn: number
        ageCognative: number
        ageActivity: number
      }
      let monthlySummery: monthlySummeryType | undefined
      try {
        const rawMonthlySummery = await CollHistory.aggregate<monthlySummeryType>([
          {
            $match: {
              userId: userId,
              userType: userType,
              recordAt: {
                $gte: new Date(query.year, query.month - 1, 1), // 시작일
                $lt: new Date(query.year, query.month, 1), // 다음달의 시작일
              },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              ageLearn: { $avg: '$ageLearn' },
              ageCognative: { $avg: '$ageCognative' },
              ageActivity: { $avg: '$ageActivity' },
            },
          },
          {
            $project: {
              _id: 0,
              count: 1,
              ageLearn: 1,
              ageCognative: 1,
              ageActivity: 1,
            },
          },
        ]).toArray()
        // if (rawMonthlySummery == null || rawMonthlySummery.length < 1) {
        //   throw new ExError('failed to find history summery', {
        //     type: 'int',
        //     code: 'DB_GET_HISTORY_SUMMERY',
        //   })
        // }
        monthlySummery = rawMonthlySummery[0]
      } catch (e) {
        if (ExError.isExError(e)) {
          throw e
        }
        throw new ExError('failed to find history summery', {
          type: 'int',
          code: 'DB_GET_HISTORY_SUMMERY',
          err: e,
        })
      }

      // API 응답
      reply.send({
        quizCountAll: allCount,
        quizCount: monthlySummery?.count ?? 0,
        ageLearn: monthlySummery?.ageLearn ?? 0,
        ageCognative: monthlySummery?.ageCognative ?? 0,
        ageActivity: monthlySummery?.ageActivity ?? 0,
      })
    },
  })
}
