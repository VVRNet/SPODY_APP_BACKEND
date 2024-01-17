import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { PointGetHistory } from './_service'

const reqQuery = Type.Object({
  from: Type.Optional(
    Type.Number({
      description: '검색 시간범위 - from (unix time 초단위)',
      examples: [1689013812],
    }),
  ),
  to: Type.Optional(
    Type.Number({
      description: '검색 시간범위 - to (unix time 초단위)',
      examples: [1689013812],
    }),
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
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
      change: Type.Number({ description: '변동량' }),
      current: Type.Number({ description: '변동량 반영 후 보유포인트' }),
      type: Type.String({
        description: '이벤트 타입. +gamePlay:게임문제맞춤 / +gameRank:승리포인트',
      }),
      quizId: Type.Optional(Type.String({ description: '관련 퀴즈 id' })),
      createdAt: Type.Number({ description: '플레이한 시간 (unix time 초단위)' }),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 문서 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiPointHistory: RegisterApi = (
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
      tags: ['포인트'],
      summary: '해당 기간 내 포인트 변경 기록들을 리턴한다 (오래된순)',
      description: `[ 400에러 코드 ]`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const query = request.query
      if ((query.from ?? 0) > (query.to ?? Number.MAX_SAFE_INTEGER)) {
        throw new ExError('time param wrong', {
          type: 'ext',
          code: 'PARAM_TIME_WRONG',
        })
      }

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (query.classId != null) {
        classId = StrToObjectId(query.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      // 히스토리 얻어오기
      const histories = await PointGetHistory(
        userId,
        query.page ?? 1,
        query.pageSize ?? 10,
        classId,
        query.from == null ? undefined : new Date(query.from * 1000),
        query.to == null ? undefined : new Date(query.to * 1000),
      )

      // API 응답
      reply.send({
        total: histories.total,
        last: histories.last,
        list: histories.list.map((h) => ({
          current: h.current,
          change: h.change,
          type: h.type,
          createdAt: Math.round(h.createAt.getTime() / 1000),
          quizId: h.quizId?.toHexString(),
        })),
      })
    },
  })
}
