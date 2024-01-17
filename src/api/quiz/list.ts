import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document, ObjectId, WithId } from 'mongodb'
import { SchemaKeyword } from '../../db/keyword'
import { CollQuiz, SchemaQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
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
  age: Type.Optional(
    Type.Number({
      description: '대상나이',
      minimum: 1,
      examples: [11],
    }),
  ),
  level: Type.Optional(
    Type.Number({
      description: '난이도 (1~5) - 1애소 해당레벨까지의 문제 리턴',
      minimum: 1,
      maximum: 5,
      examples: [1],
    }),
  ),
  solved: Type.Optional(
    Type.Boolean({
      description: 'true(내가 푼 문제), false( 안 푼 문제), 안쓰면 전체 - 현재는 무시됨',
    }),
  ),
  madeByMe: Type.Optional(
    Type.Boolean({
      description: 'true(내가 만든 문제), false(내가 안만든 문제), 안쓰면 전체',
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
  includeAll: Type.Optional(
    Type.Boolean({
      description: '값이 없거나 false면 일반검색, true면 컨펌안된 전체검색 가능',
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
      id: Type.String({ description: '퀴즈 id' }),
      keywordId: Type.String({ description: '과목명 id' }),
      keyword: Type.String({ description: '과목명, 요청의 언어에 맞춘 번역문자열로 줌' }),
      categoryId: Type.Optional(Type.String({ description: '과목명 id' })),
      age: Type.Number({ description: '나이' }),
      level: Type.Number({ description: '난이도' }),
      madeByMe: Type.Boolean({ description: '현재 학생/반이 만들었는지 여부' }),
      madeByTeacher: Type.Boolean({ description: '선생님이 만들었는지 여부' }),
      solved: Type.Boolean({
        description:
          '이전에 푼적이 있는지 여부 - 히스토리 관련 업데이트 후 반영예정. 현재는 false 고정',
      }),
      isSearchable: Type.Boolean({ description: '관리자 검수된 퀴즈인지 여부' }),
      statCount: Type.Number({ description: '총 유저 풀이회수' }),
      statAvgAgeLearn: Type.Number({ description: '총 유저 풀이 평균 학습능력 나이' }),
      statAvgAgeCognative: Type.Number({ description: '총 유저 풀이 평균 인지능력 나이' }),
      statAvgAgeActivity: Type.Number({ description: '총 유저 풀이 평균 운동능력 나이' }),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 문서 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiQuizList: RegisterApi = (
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
      tags: ['퀴즈'],
      summary: '퀴즈 은행 목록',
      description: `키워드정보가 주어지지 않으면, 다른조건들과만 매칭하여 리스팅.
      [ 400에러 코드 ]

      . PARAM_AGE_WRONG : 나이정보가 잘못됨 - 최대나이가 최소나이보다 같거나 커야함
      . PARAM_KEYWORD_VALIDATE : 키워드 관련 요청 파마리터가 잘못됨
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
      const requestParam = request.query

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (requestParam.classId != null) {
        classId = StrToObjectId(requestParam.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      // 키워드 찾기
      let keywordInfo: WithId<SchemaKeyword> | null = null
      if (requestParam.keywordId != null) {
        keywordInfo = await KeywordGetFromId(StrToObjectId(requestParam.keywordId, 'KEYWORD'))
        if (keywordInfo == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }
      } else if (requestParam.keyword != null) {
        keywordInfo = await KeywordGetWithWord(requestParam.language, requestParam.keyword)
      }
      if (keywordInfo == null && (requestParam.keyword != null || requestParam.keywordId != null)) {
        throw new ExError('keyword not existed', {
          type: 'ext',
          code: 'KEYWORD_NOTFOUND',
        })
      }

      // 요청과 동일한 카테고리가 존재하는지 확인
      let categoryId: ObjectId | undefined = undefined
      if (requestParam.category != null) {
        const categoryInfo = await CategoryGetWithWord(requestParam.language, requestParam.category)
        if (categoryInfo == null) {
          throw new ExError('category not existed', {
            type: 'ext',
            code: 'CATEGORY_NOTFOUND',
          })
        }
        categoryId = categoryInfo._id
      }

      const pageSize = requestParam.pageSize ?? 10
      const pageSkipCount = ((requestParam.page ?? 1) - 1) * pageSize

      // 퀴즈 쿼리
      const condMatch: Record<string, any> = {}
      if (keywordInfo != null) {
        condMatch.keywordId = keywordInfo._id
      }
      if (categoryId != null) {
        condMatch.categoryId = categoryId
      }
      if (requestParam.age != null) {
        condMatch.age = requestParam.age
      }
      if ((requestParam.includeAll ?? false) === false) {
        condMatch.isSearchable = true
      }
      if (requestParam.madeByMe != null) {
        const id = userType === 'org' ? classId : userId
        const type = userType === 'org' ? 'class' : 'std'
        condMatch.creator = requestParam.madeByMe ? id : { $ne: id }
        condMatch.creatorType = requestParam.madeByMe ? type : { $ne: type }
      }
      if (requestParam.level != null) {
        condMatch.level = requestParam.level
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
                  createDate: -1,
                },
              },
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
      type quizWithKeyword = {
        result: (SchemaQuiz & { keywords?: SchemaKeyword[] })[]
        total?: number
      }
      let quizs: quizWithKeyword
      try {
        quizs = (await CollQuiz.aggregate<quizWithKeyword>(pipelines).toArray())[0]
      } catch (e) {
        throw new ExError('failed to get quiz list', {
          type: 'int',
          code: 'DB_FIND_QUIZ',
          err: e,
        })
      }

      // API 응답
      reply.send({
        total: quizs.total ?? 0,
        last: (quizs.total ?? 0) - pageSkipCount <= pageSize,
        list: quizs.result.map((q) => {
          const keywordTrans = keywordInfo?.trans ?? q.keywords?.[0].trans
          if (keywordTrans == null) {
            throw new ExError('wrong data', {
              type: 'int',
              code: 'DB_FIND_QUIZ',
            })
          }
          return {
            id: q._id!.toHexString(),
            keywordId: q.keywordId.toHexString(),
            keyword: (keywordTrans.find((t) => t.language === requestParam.language) ??
              keywordTrans.find((t) => t.language === 'en'))!.word,
            categoryId: q.categoryId?.toHexString(),
            age: q.age,
            level: q.level,
            madeByMe:
              q.creator.equals(userType === 'org' ? classId! : userId) &&
              q.creatorType === (userType === 'org' ? 'class' : 'std'),
            madeByTeacher: q.creatorType === 'class',
            solved: false,
            isSearchable: q.isSearchable ?? false,
            statCount: q.statCount ?? 0, // 풀이 회수
            statAvgAgeLearn: q.statAvgAgeLearn ?? 0, // 평균 학습능력 나이
            statAvgAgeCognative: q.statAvgAgeCognative ?? 0, // 평균 인지능력 나이
            statAvgAgeActivity: q.statAvgAgeActivity ?? 0, // 평균 운동능력 나이
          }
        }),
      })
    },
  })
}
