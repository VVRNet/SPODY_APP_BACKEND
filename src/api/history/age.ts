import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { SchemaCategory } from '../../db/category'
import { CollHistory, SchemaHistory } from '../../db/history'
import { SchemaKeyword } from '../../db/keyword'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId, KeywordGetWithWord } from '../subject/_service'

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
      description: '과목 id, 이 필드가 있으면 다른 과목정보 관련 정보필드들은 입력하면 안됨',
    }),
  ),
  keyword: Type.Optional(Type.String({ description: '언어코드에 맞는 과목명' })),
  category: Type.Optional(
    Type.String({
      description: '카테고리명',
      minLength: 1,
      examples: ['운동'],
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
      date: Type.Number({ description: '날짜 (unix time 초단위)' }),
      ageLearn: Type.Number({ description: '학습능력 나이 평균' }),
      ageCognative: Type.Number({ description: '인지능력 나이 평균' }),
      ageActivity: Type.Number({ description: '운동능력 나이 평균' }),
      count: Type.Number({ description: '기록 건수' }),
    }),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryAge: RegisterApi = (
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
      summary: '해당 기간 날짜별 학습/인지/운동 능력의 평균을 리턴한다',
      description: `[ 400에러 코드 ]

      . PARAM_TIME_WRONG : 시간정보가 잘못됨 - to가 from보다 같거나 커야함
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

      // 키워드 찾기
      let keywordInfo: WithId<SchemaKeyword> | null = null
      if (query.keywordId != null || query.keyword != null) {
        if (query.keywordId != null) {
          keywordInfo = await KeywordGetFromId(StrToObjectId(query.keywordId, 'KEYWORD'))
          if (keywordInfo == null) {
            throw new ExError('keyword not existed', {
              type: 'ext',
              code: 'KEYWORD_NOTFOUND',
            })
          }
        } else if (query.keyword != null) {
          keywordInfo = await KeywordGetWithWord(query.language, query.keyword)
        }
        if (keywordInfo == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }
      }

      // 카테고리 찾기
      let categoryInfo: WithId<SchemaCategory> | null = null
      if (query.category != null) {
        categoryInfo = await CategoryGetWithWord(query.language, query.category)
        if (keywordInfo == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }
      }

      // 검색 파이프라인
      const queryDateFrom = query.from == null ? null : new Date(query.from * 1000)
      const queryDateTo = query.to == null ? null : new Date(query.to * 1000)
      const condMatch: Record<string, any> = {
        userId: classId != null ? classId : userId,
        userType: userType === 'org' ? 'class' : 'std',
      }
      if (queryDateFrom != null && queryDateTo != null) {
        condMatch.recordAt = {
          $gte: queryDateFrom,
          $lte: queryDateTo,
        }
      } else {
        if (query.from != null) {
          condMatch.recordAt = { $gte: queryDateFrom }
        }
        if (query.to != null) {
          condMatch.recordAt = { $lte: queryDateTo }
        }
      }
      if (categoryInfo != null) {
        condMatch.categoryId = categoryInfo._id
      }
      if (keywordInfo != null) {
        condMatch.keywordId = keywordInfo._id
      }
      let histories: WithId<SchemaHistory>[]
      try {
        histories = await CollHistory.find(condMatch, {
          sort: { recordAt: 1 },
          projection: { ageLearn: 1, ageCognative: 1, ageActivity: 1, recordAt: 1 },
        }).toArray()
      } catch (e) {
        throw new ExError('failed to find user history', {
          type: 'int',
          code: 'DB_FIND_USERHISTORY',
          info: query,
        })
      }

      const dateCountArr: {
        date: number
        count: number
        sumLearn: number
        sumCognative: number
        sumActivity: number
      }[] = []
      for (const h of histories) {
        const dateKey = Math.round(
          new Date(
            h.recordAt.getFullYear(),
            h.recordAt.getMonth(),
            h.recordAt.getDate(),
          ).getTime() / 1000,
        )
        const dateElem = dateCountArr.find((a) => a.date === dateKey)
        if (dateElem == null) {
          dateCountArr.push({
            date: dateKey,
            count: 1,
            sumLearn: h.ageLearn,
            sumActivity: h.ageActivity,
            sumCognative: h.ageCognative,
          })
        } else {
          dateElem.count++
          dateElem.sumLearn += h.ageLearn
          dateElem.sumActivity += h.ageActivity
          dateElem.sumCognative += h.ageCognative
        }
      }

      // 날짜별 데이터 정리
      const resDateFrom =
        queryDateFrom == null
          ? dateCountArr[0].date
          : Math.round(
              new Date(
                queryDateFrom.getFullYear(),
                queryDateFrom.getMonth(),
                queryDateFrom.getDate(),
              ).getTime() / 1000,
            )
      const resDateTo =
        queryDateTo == null
          ? dateCountArr[dateCountArr.length - 1].date
          : Math.round(
              new Date(
                queryDateTo.getFullYear(),
                queryDateTo.getMonth(),
                queryDateTo.getDate(),
              ).getTime() / 1000,
            )
      const resData: {
        date: number
        count: number
        ageLearn: number
        ageCognative: number
        ageActivity: number
      }[] = []
      for (let date = resDateFrom; date <= resDateTo; date = date + 86400) {
        const existedHistory = dateCountArr.find((c) => c.date === date)
        resData.push({
          date: date,
          count: existedHistory?.count ?? 0,
          ageLearn: existedHistory == null ? 0 : existedHistory.sumLearn / existedHistory.count,
          ageCognative:
            existedHistory == null ? 0 : existedHistory.sumActivity / existedHistory.count,
          ageActivity:
            existedHistory == null ? 0 : existedHistory.sumCognative / existedHistory.count,
        })
      }

      // API 응답
      reply.send({
        list: resData,
      })
    },
  })
}
