import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document, ObjectId, WithId } from 'mongodb'
import { CollHistory, SchemaHistory } from '../../db/history'
import { SchemaKeyword } from '../../db/keyword'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId, KeywordGetWithWord } from '../subject/_service'

const reqQuery = Type.Object({
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  keywordId: Type.Optional(
    Type.String({
      description: '과목 id, 이 필드가 있으면 keyword필드는 입력하면 안됨',
    }),
  ),
  keyword: Type.Optional(Type.String({ description: '언어코드에 맞는 과목명' })),
  timeFrom: Type.Optional(
    Type.Number({
      description: '검색 시간범위 - from (unix time 초단위)',
      examples: [1689013812],
    }),
  ),
  timeTo: Type.Optional(
    Type.Number({
      description: '검색 시간범위 - to (unix time 초단위)',
      examples: [1689013812],
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
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  list: Type.Array(
    Type.Object({
      id: Type.String({ description: '기록 id' }),
      keywordId: Type.String({ description: '과목명 id' }),
      keyword: Type.String({ description: '과목명, 요청의 언어에 맞춘 번역문자열로 줌' }),
      answerOrder: Type.Array(Type.Number(), { description: '출제 문제 순서' }),
      answerTime: Type.Array(Type.Number(), { description: '답변 소요시간' }),
      answerCorrect: Type.Array(Type.Boolean(), { description: '정답 여부' }),
      ageLearn: Type.Number({ description: '학습능력 나이' }),
      ageCognative: Type.Number({ description: '인지능력 나이' }),
      ageActivity: Type.Number({ description: '운동능력 나이' }),
      recordAt: Type.Number({ description: '기록시간, (unix time 초단위)' }),
      gameId: Type.Optional(
        Type.String({ description: '참여했던 게임 id, 이 항목이 없다면 혼자한 게임' }),
      ),
      gameCount: Type.Optional(Type.Number({ description: '참여했던 게임의 회차' })),
      rank: Type.Optional(Type.Number({ description: '게임등수, 이 항목이 없다면 혼자한 게임' })),
      membersImgUrl: Type.Optional(Type.Array(Type.String(), { description: '답변 소요시간' })),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 문서 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryUserMe: RegisterApi = (
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
      summary: '기록 목록 조회 - 유저프로필 연동은 관련개발 이후 진행 가능',
      description: `[ 400에러 코드 ]

      . PARAM_TIME_WRONG : 시간정보가 잘못됨 - 최대나이가 최소나이보다 같거나 커야함
      . PARAM_KEYWORD_VALIDATE : 키워드 관련 요청 파마리터가 모두 옴. id랑 단어중 하나만 필요
      . KEYWORD_WRONG_ID : 요청 내 keyword id 형식이 잘못됨
      . KEYWORD_NOTFOUND : 요청 내 keyword id 가 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const param = request.query

      if ((param.timeFrom ?? 0) > (param.timeTo ?? Number.MAX_SAFE_INTEGER)) {
        throw new ExError('time param wrong', {
          type: 'ext',
          code: 'PARAM_TIME_WRONG',
        })
      }
      if (param.keywordId != null && param.keyword != null) {
        throw new ExError('keyword param not existed', {
          type: 'ext',
          code: 'PARAM_KEYWORD_VALIDATE',
        })
      }

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (param.classId != null) {
        classId = StrToObjectId(param.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      // 키워드 찾기
      let keywordInfo: WithId<SchemaKeyword> | null = null
      if (param.keywordId != null) {
        keywordInfo = await KeywordGetFromId(StrToObjectId(param.keywordId, 'KEYWORD'))
        if (keywordInfo == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }
      } else if (param.keyword != null) {
        keywordInfo = await KeywordGetWithWord(param.language, param.keyword)
      }
      if (keywordInfo == null && (param.keyword != null || param.keywordId != null)) {
        throw new ExError('keyword not existed', {
          type: 'ext',
          code: 'KEYWORD_NOTFOUND',
        })
      }

      const pageSize = param.pageSize ?? 10
      const pageSkipCount = ((param.page ?? 1) - 1) * pageSize

      // 기록 쿼리
      const condMatch: Record<string, any> = {
        userId: userType === 'org' ? classId : userId,
        userType: userType === 'org' ? 'class' : 'std',
      }
      if (keywordInfo != null) {
        condMatch.keywordId = keywordInfo._id
      }
      if (param.timeFrom != null || param.timeTo != null) {
        const constCondMatchRecordAt: Record<string, any> = {}
        if (param.timeFrom != null) {
          constCondMatchRecordAt.$gte = new Date(param.timeFrom * 1000)
        }
        if (param.timeTo != null) {
          constCondMatchRecordAt.$lte = new Date(param.timeTo * 1000)
        }
        condMatch.recordAt = constCondMatchRecordAt
      }
      const pipelines: Document[] = [
        {
          $match: condMatch,
        },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [
              { $skip: pageSkipCount },
              { $limit: pageSize },
              ...(keywordInfo == null
                ? [
                    {
                      $lookup: {
                        from: 'keyword',
                        localField: 'keywordId',
                        foreignField: '_id',
                        as: 'keywords',
                      },
                    },
                  ]
                : []),
              { $project: { question: 0 } },
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
      type historyUserWithKeyword = {
        result: (SchemaHistory & { keywords?: SchemaKeyword[] })[] // & { historyGame?: SchemaKeyword[] }
        total?: number
      }
      let histories: historyUserWithKeyword
      try {
        histories = (await CollHistory.aggregate<historyUserWithKeyword>(pipelines).toArray())[0]
      } catch (e) {
        throw new ExError('failed to get history list', {
          type: 'int',
          code: 'DB_FIND_USERHISTORY',
          err: e,
        })
      }

      // API 응답
      reply.send({
        total: histories.total ?? 0,
        last: (histories.total ?? 0) - pageSkipCount <= pageSize,
        list: histories.result.map((q) => {
          const keywordTrans = keywordInfo?.trans ?? q.keywords?.[0].trans
          if (keywordTrans == null) {
            throw new ExError('wrong data', {
              type: 'int',
              code: 'DB_FIND_USERHISTORY',
            })
          }
          return {
            id: q._id!.toHexString(),
            keywordId: q.keywordId.toHexString(),
            keyword: (keywordTrans.find((t) => t.language === param.language) ??
              keywordTrans.find((t) => t.language === 'en'))!.word,
            answerOrder: q.answerOrder,
            answerTime: q.answerTime,
            answerCorrect: q.answerCorrect,
            ageLearn: q.ageLearn,
            ageCognative: q.ageCognative,
            ageActivity: q.ageActivity,
            recordAt: Math.round(q.recordAt.getTime() / 1000),
            gameId: q.gameId?.toHexString(),
            gameCount: q.gameCount,
            rank: q.rank,
            membersImgUrl: undefined, // TODO:기록 연계해서 채우기
          }
        }),
      })
    },
  })
}
