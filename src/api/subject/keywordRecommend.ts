import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ExError } from '../../util/error'
import { OpenAiAsk } from '../../util/openAi'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  county: Type.String({
    description: '국가코드 - https://ko.wikipedia.org/wiki/ISO_3166-1_alpha-2',
    minLength: 2,
    maxLength: 2,
    examples: ['KR'],
  }),
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  age: Type.Number({
    description: '대상나이',
    minimum: 1,
    examples: [11],
  }),
  gender: Type.Enum<{ male: 'male'; female: 'female' }>(
    {
      male: 'male',
      female: 'female',
    },
    { description: '성별 - male(남자),female(여자)', examples: ['male'] },
  ),
  interest: Type.Optional(
    Type.Array(
      Type.String({
        description: '개별 관심과목명',
        minLength: 1,
      }),
      { description: '관심과목명 목록 배열' },
    ),
  ),
  correlation: Type.Optional(
    Type.Number({
      description: '관심과목명 관련도',
      minimum: 1,
    }),
  ),
  exclude: Type.Optional(
    Type.Array(
      Type.String({
        description: '개별 제외과목명',
        minLength: 1,
      }),
      { description: '제외과목명 목록 배열' },
    ),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  keyword: Type.Array(Type.String({ description: '과목명' }), { description: '과목명 목록. 30개' }),
})
type resBodyType = Static<typeof resBody>

export const ApiSubjectKeywordRecommend: RegisterApi = (
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
      tags: ['과목'],
      summary: '추천 과목명 목록 요청',
      description: `[ 400에러 코드 ]

      . 없음

[ GPT 관련 500 에러코드 ]

      . OPENAI_FAILED : gpt 요청 실패
      . OPENAI_TIMEOUT : gpt 요청에서 timeout 발생
      . OPENAI_WRONG : gpt 응답 내용이 잘못되서 처리 불가
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const interestMessage =
        request.query.interest == null
          ? ''
          : `4. 최근 관심사: ${request.query.interest.join(',')}${
              request.query.correlation == null
                ? ''
                : ` - 관심 정도는 0~10의 수치로 표현할때 ${request.query.correlation}`
            }`
      const excludeMessage =
        request.query.exclude == null
          ? ''
          : `4. 결과에 이 단어들은 제외해줘 - ${request.query.exclude.join(',')}`

      const languageMap = {
        ko: '한국어',
        en: '영어',
        ja: '히라가나/카타가나',
        zh: '중국어',
        es: '스페인어',
        fi: '핀란드어',
        fr: '프랑스어',
      }
      const prompt = `퀴즈를 풀 학생이 관심을 가질만 하거나 공부하면 좋을 주제단어 10개를 알려줘.

대상 학생에 대한 조건들은 아래와 같아.
1. 거주국가의 'ISO 3166-1 alpah-2' 코드: ${request.query.county}
2. 나이: ${request.query.age}
3. 성별: ${request.query.gender === 'male' ? '남자' : '여자'}
${interestMessage}

주제단어들에 대한 조건은 아래와 같아.
1. 단일 단어로 된 명사
2. 각 단어들간 의미가 중복되거나 비슷하면 안됨
3. 단어의 언어를 한국어 대신 ${languageMap[request.query.language]}로 바꿔줘
${excludeMessage}

답변은 이렇게 리스트 형식의 json으로 해줘.
{"keyword" : ["주제1","주제2",...]}`

      console.log(prompt)

      // GPT 질의
      const resRaw = await OpenAiAsk(prompt)
      let res: { keyword: string[] }
      try {
        res = JSON.parse(resRaw)
        if (!Array.isArray(res.keyword)) {
          throw new ExError('gpt answer is wrong format', {
            type: 'int',
            code: 'OPENAI_WRONG',
            info: { message: prompt, response: JSON.stringify(resRaw) },
          })
        }
      } catch (e) {
        if (ExError.isExError(e)) {
          throw e
        }
        throw new ExError('gpt request failed', {
          type: 'int',
          code: 'OPENAI_WRONG',
          info: { message: prompt, response: JSON.stringify(resRaw) },
          err: e,
        })
      }

      // API 응답
      reply.send({
        keyword: res.keyword,
      })
    },
  })
}
