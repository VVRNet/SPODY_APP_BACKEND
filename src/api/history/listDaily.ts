import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document, ObjectId, WithId } from 'mongodb'
import { SchemaCategory } from '../../db/category'
import { CollHistory, SchemaHistory } from '../../db/history'
import { SchemaKeyword } from '../../db/keyword'
import { SchemaQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
import { ClassCheckAvailable, ClassGetFromID } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId, KeywordGetWithWord } from '../subject/_service'
import { UserGetFromID } from '../user/_service'

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
  playMode: Type.Enum<{ solo: 'solo'; game: 'game'; all: 'all' }>(
    { solo: 'solo', game: 'game', all: 'all' },
    {
      description: '게임모드 - solo:혼자하기 game:같이하기 all:전부',
      examples: ['all'],
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
      id: Type.Optional(Type.String({ description: '기록 id' })),
      gameId: Type.Optional(Type.String({ description: '게임 id' })),
      gameCount: Type.Optional(Type.Number({ description: '게임 회차' })),
      gameMembers: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: '유저/반 id' }),
            type: Type.Enum<{ std: 'std'; class: 'class' }>(
              {
                std: 'std',
                class: 'class',
              },
              {
                description: '내보낼 대상의 학생/반 여부 - std(학생),class(반)',
                examples: ['std'],
              },
            ),
            name: Type.String({ description: '유저/반 이름' }),
            orgName: Type.Optional(Type.String({ description: '반일경우, 기관 이름' })),
            imgUrl: Type.Optional(Type.String({ description: '이미지 url' })),
            country: Type.Optional(Type.String({ description: '국가정보' })),
          }),
        ),
      ),
      categoryId: Type.Optional(Type.String({ description: '카테고리 id' })),
      category: Type.Optional(Type.String({ description: '카테고리' })),
      keywordId: Type.String({ description: '키워드 id' }),
      keyword: Type.Optional(Type.String({ description: '키워드' })),
      quizId: Type.String({ description: '퀴즈 id' }),
      quizAge: Type.Optional(Type.Number({ description: '퀴즈 나이' })),
      quizLevel: Type.Optional(Type.Number({ description: '퀴즈 레벨' })),
      rank: Type.Optional(Type.Number({ description: '퀴즈 순위' })),
      ageLearn: Type.Number({ description: '학습능력 나이' }),
      ageCognative: Type.Number({ description: '인지능력 나이' }),
      ageActivity: Type.Number({ description: '운동능력 나이' }),
      recordAt: Type.Number({ description: '플레이한 시간 (unix time 초단위)' }),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 문서 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryDailyList: RegisterApi = (
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
      summary: '해당 기간 내 게임기록들을 리턴한다 (오래된순)',
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

      const pageSize = query.pageSize ?? 10
      const pageSkipCount = ((query.page ?? 1) - 1) * pageSize

      // 검색 파이프라인
      const condMatch: Record<string, any> = {
        userId: classId != null ? classId : userId,
        userType: userType === 'org' ? 'class' : 'std',
      }
      if (query.playMode === 'game') {
        condMatch.gameId = { $ne: null }
      }
      if (query.playMode === 'solo') {
        condMatch.gameId = null
      }
      if (query.from != null && query.to != null) {
        condMatch.recordAt = {
          $gte: new Date(query.from * 1000),
          $lte: new Date(query.to * 1000),
        }
      } else {
        if (query.from != null) {
          condMatch.recordAt = { $gte: new Date(query.from * 1000) }
        }
        if (query.to != null) {
          condMatch.recordAt = { $lte: new Date(query.to * 1000) }
        }
      }
      if (categoryInfo != null) {
        condMatch.categoryId = categoryInfo._id
      }
      if (keywordInfo != null) {
        condMatch.keywordId = keywordInfo._id
      }

      const pipelines: Document[] = [
        {
          $match: condMatch,
        },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [
              {
                $sort: {
                  recordAt: 1,
                },
              },
              { $skip: pageSkipCount },
              { $limit: pageSize },
              {
                $lookup: {
                  from: 'quiz',
                  localField: 'quizId',
                  foreignField: '_id',
                  as: 'quizs',
                },
              },
              {
                $lookup: {
                  from: 'keyword',
                  localField: 'keywordId',
                  foreignField: '_id',
                  as: 'keywords',
                },
              },
              {
                $lookup: {
                  from: 'category',
                  localField: 'categoryId',
                  foreignField: '_id',
                  as: 'categories',
                },
              },
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
        result: (SchemaHistory & {
          quizs?: SchemaQuiz[]
          keywords?: SchemaKeyword[]
          categories?: SchemaCategory[]
        })[]
        total?: number
      }
      let histories: historyUserWithKeyword
      try {
        histories = (await CollHistory.aggregate<historyUserWithKeyword>(pipelines).toArray())[0]
      } catch (e) {
        throw new ExError('failed to find user history', {
          type: 'int',
          code: 'DB_FIND_USERHISTORY',
          info: query,
        })
      }

      const resultHistories = await Promise.all(
        histories.result.map(async (h) => {
          const gameMembers =
            h.gameMember == null
              ? undefined
              : await Promise.all(
                  h.gameMember.map(async (m) => {
                    const classInfo = m.type === 'std' ? null : await ClassGetFromID(m.id)
                    const userInfo = await UserGetFromID(
                      classInfo == null ? m.id : classInfo.userId,
                    )
                    if (userInfo == null) {
                      throw new ExError('failed to get unser info', {
                        type: 'int',
                        code: 'DB_USER_GET',
                      })
                    }
                    return {
                      id: (classInfo?._id ?? userInfo._id).toHexString(),
                      type: m.type,
                      name: classInfo?.name ?? userInfo.name ?? '',
                      orgName: classInfo == null ? undefined : userInfo.name,
                      imgUrl: userInfo.imgUrl,
                      country: userInfo.country,
                    }
                  }),
                )

          return {
            id: h._id?.toHexString(),
            gameId: h.gameId?.toHexString(),
            gameCount: h.gameCount,
            gameMembers: gameMembers,
            recordAt: Math.round(h.recordAt.getTime() / 1000),
            categoryId: h.categoryId?.toHexString(),
            category: h.categories?.[0]?.trans.find((t) => t.language === query.language)?.word,
            keywordId: h.keywordId.toHexString(), ///
            keyword: h.keywords?.[0]?.trans.find((t) => t.language === query.language)?.word,
            quizId: h.quizId.toHexString(),
            quizAge: h.quizs?.[0]?.age,
            quizLevel: h.quizs?.[0]?.level,
            rank: h.rank,
            ageLearn: h.ageLearn,
            ageCognative: h.ageCognative,
            ageActivity: h.ageActivity,
          }
        }),
      )

      // API 응답
      reply.send({
        total: histories.total ?? 0,
        last: (histories.total ?? 0) - pageSkipCount <= pageSize,
        list: resultHistories,
      })
    },
  })
}
