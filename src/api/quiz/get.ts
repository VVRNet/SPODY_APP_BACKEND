import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetFromID } from '../category/_service'
import { RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId } from '../subject/_service'
import { QuizGetFromId } from './_service'

const reqParam = Type.Object({
  quizId: Type.String({
    description: '퀴즈 id',
    minLength: 1,
  }),
})
type reqParamType = Static<typeof reqParam>

const reqQuery = Type.Object({
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBodyQuestion = Type.Object({
  question: Type.String({ description: '질문' }),
  choice: Type.Array(Type.String({ description: '선택지' })),
  imageUrl: Type.Optional(Type.Array(Type.String({ description: '선택지 별 이미지 주소' }))),
  answer: Type.Number({ description: '4개 선택지 중 정답의 인덱스 (0~4)' }),
  correctCount: Type.Number({
    description: '맞춘 회수, 푼 회수와 계산해서 정답률 산출 가능',
  }),
  tryCount: Type.Number({
    description: '푼 회수, 맞춘회수와 계산해서 정답률 산출 가능',
  }),
})

const resBody = Type.Object({
  id: Type.String({ description: '퀴즈 id' }),
  keywordId: Type.String({ description: '과목명 id' }),
  keyword: Type.String({ description: '과목명, 요청의 언어에 맞춘 번역문자열로 줌' }),
  category: Type.Optional(
    Type.String({ description: '카테고리명, 요청의 언어에 맞춘 번역문자열로 줌' }),
  ),
  age: Type.Number({ description: '나이' }),
  gender: Type.Enum<{ male: 'male'; female: 'female' }>(
    {
      male: 'male',
      female: 'female',
    },
    { description: '성별 - male(남자),female(여자)' },
  ),
  quiz: Type.Array(resBodyQuestion),
  createDate: Type.Number({ description: '생성일' }),
  level: Type.Number({ description: '난이도' }),
  ratingCount: Type.Number({ description: '평가회수' }),
  rating: Type.Number({ description: '평균 평가점수' }),
  madeByTeacher: Type.Boolean({ description: '선생님이 만들었는지 여부' }),
  isSearchable: Type.Boolean({ description: '관리자 검수된 퀴즈인지 여부' }),
  solved: Type.Boolean({
    description:
      '이전에 푼적이 있는지 여부 - 히스토리 관련 업데이트 후 반영예정. 현재는 false 고정.',
  }),
  statCount: Type.Number({ description: '총 유저 풀이회수' }),
  statAvgAgeLearn: Type.Number({ description: '총 유저 풀이 평균 학습능력 나이' }),
  statAvgAgeCognative: Type.Number({ description: '총 유저 풀이 평균 인지능력 나이' }),
  statAvgAgeActivity: Type.Number({ description: '총 유저 풀이 평균 운동능력 나이' }),
})
type resBodyType = Static<typeof resBody>

export const ApiQuizGet: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Params: reqParamType; Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: `${url}/:quizId`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['퀴즈'],
      summary: '단일 퀴즈에 대한 자세한 정보 요청',
      description: `[ 400에러 코드 ]

      . QUIZ_WRONG_ID : 요청 내 quiz id 형식이 잘못됨
      . QUIZ_NOTFOUND : 요청 내 quiz 가 존재하지 않음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      params: reqParam,
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const params = request.params
      const query = request.query

      // 퀴즈 얻어오기
      const quizInfo = await QuizGetFromId(StrToObjectId(request.params.quizId, 'QUIZ'))
      if (quizInfo == null) {
        throw new ExError('quiz not found', {
          type: 'ext',
          code: 'QUIZ_NOTFOUND',
        })
      }

      // 키워드 얻어오기
      const keywordInfo = await KeywordGetFromId(quizInfo.keywordId)
      const keyword = (
        keywordInfo?.trans.find((t) => t.language === query.language) ??
        keywordInfo?.trans.find((t) => t.language === 'en')
      )?.word
      if (keyword == null) {
        throw new ExError('category not existed', {
          type: 'int',
          code: 'KEYWORD_NOT_EXITED',
          info: {
            keywordId: quizInfo.keywordId.toHexString(),
            language: query.language,
          },
        })
      }

      // 카테고리 얻어오기
      let category: string | undefined = undefined
      if (quizInfo.categoryId != null) {
        const categoryInfo = await CategoryGetFromID(quizInfo.categoryId)
        category = (
          categoryInfo?.trans.find((t) => t.language === query.language) ??
          categoryInfo?.trans.find((t) => t.language === 'en')
        )?.word
        if (categoryInfo == null) {
          throw new ExError('category not existed', {
            type: 'int',
            code: 'CATEGORY_NOT_EXITED',
            info: {
              categoryId: quizInfo.categoryId.toHexString(),
              language: query.language,
            },
          })
        }
      }

      // API 응답
      reply.send({
        id: params.quizId,
        keywordId: quizInfo.keywordId.toHexString(),
        keyword: keyword,
        category: category,
        age: quizInfo.age,
        gender: quizInfo.gender,
        quiz: quizInfo.question.map((q) => ({
          question: (q.question.find((qq) => qq.language === query.language) ??
            q.question.find((qq) => qq.language === 'en'))!.text,
          choice: (q.choice.find((qq) => qq.language === query.language) ??
            q.choice.find((qq) => qq.language === 'en'))!.text,
          imageUrl: q.imageUrl ?? undefined,
          answer: q.answer,
          correctCount: q.correctCount,
          tryCount: q.tryCount ?? 0,
        })),
        createDate: Math.round(quizInfo.createDate.getTime() / 1000),
        level: quizInfo.level,
        ratingCount: quizInfo.ratingCount,
        rating: quizInfo.rating,
        madeByTeacher: quizInfo.creatorType === 'class',
        solved: false,
        isSearchable: quizInfo.isSearchable ?? false,
        statCount: quizInfo.statCount ?? 0, // 풀이 회수
        statAvgAgeLearn: quizInfo.statAvgAgeLearn ?? 0, // 평균 학습능력 나이
        statAvgAgeCognative: quizInfo.statAvgAgeCognative ?? 0, // 평균 인지능력 나이
        statAvgAgeActivity: quizInfo.statAvgAgeActivity ?? 0, // 평균 운동능력 나이
      })
    },
  })
}
