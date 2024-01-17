import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { CollQuiz } from '../../db/quiz'
import { ExError } from '../../util/error'
import { OpenAiAsk } from '../../util/openAi'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId, KeywordGetWithWord, KeywordInsert } from '../subject/_service'

const reqQuery = Type.Object({
  keywordId: Type.Optional(
    Type.String({
      description: '과목 id, 이 필드가 있으면 다른 과목정보 관련 정보필드들은 입력하면 안됨',
    }),
  ),
  keyword: Type.Optional(Type.String({ description: '언어코드에 맞는 과목명' })),
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  category: Type.Optional(
    Type.String({
      description: '카테고리명, 요청의 해당언어 단어로 주기',
      minLength: 1,
      examples: ['운동'],
    }),
  ),
  gender: Type.Enum<{ male: 'male'; female: 'female' }>(
    {
      male: 'male',
      female: 'female',
    },
    { description: '성별 - male(남자),female(여자)', examples: ['male'] },
  ),
  age: Type.Number({
    description: '대상나이',
    minimum: 1,
    examples: [11],
  }),
  level: Type.Number({
    description: '난이도 (1~5)',
    minimum: 1,
    maximum: 5,
    examples: [1],
  }),
  needConfirm: Type.Boolean({
    description: '즉시 확정여부. true면, 언어별 번역까지 한번에 진행 후 DB저장',
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
  quiz: Type.Array(
    Type.Object({
      question: Type.Array(Type.Object({ language: Type.String(), text: Type.String() }), {
        description: '언어별 문제 텍스트',
      }),
      choice: Type.Array(
        Type.Object({ language: Type.String(), text: Type.Array(Type.String()) }),
        { description: '언어별 선택지 배열' },
      ),
      imageUrl: Type.Optional(
        Type.Array(Type.String(), {
          description: '선택지에 대한 이미지 url',
        }),
      ),
      answer: Type.Number({ description: '4개 선택지 중 정답의 인덱스 (0~4)' }),
    }),
  ),
  id: Type.Optional(Type.String({ description: '퀴즈 id. needFix가 true면 만들어짐' })),
})
type resBodyType = Static<typeof resBody>

export const ApiQuizRecommendOne: RegisterApi = (
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
      summary: '퀴즈 문제 목록 요청',
      description: `[ 400에러 코드 ]

      . PARAM_KEYWORD_VALIDATE : 키워드 관련 요청 파마리터가 잘못됨
      . KEYWORD_WRONG_ID : 요청 내 keyword id 형식이 잘못됨
      . KEYWORD_NOTFOUND : 요청 내 keyword id 가 존재하지 않음

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
      const requestQuery = request.query

      // 요청 조건확인 - 키워드 id 와 다른 필드들 정보가 중복되는지 확인
      if (
        (requestQuery.keywordId != null && requestQuery.keyword != null) ||
        (requestQuery.keywordId == null && requestQuery.keyword == null)
      ) {
        throw new ExError('param keyword validation', {
          type: 'ext',
          code: 'PARAM_KEYWORD_VALIDATE',
        })
      }
      let promptInfo: {
        keyword: string
        language: string
        category?: string
      }

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (requestQuery.classId != null) {
        classId = StrToObjectId(requestQuery.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      let keywordId: ObjectId | undefined = undefined

      if (requestQuery.keywordId == null) {
        // id가 없다면 요청 body 내용으로 퀴즈 질의 정보 구성
        // 해당언어 키워드 DB에 있는지 확인
        keywordId = (await KeywordGetWithWord(requestQuery.language!, requestQuery.keyword!))?._id
        promptInfo = {
          keyword: requestQuery.keyword!,
          language: requestQuery.language!,
        }
      } else {
        // id가 있다면, DB에서 퀴즈 질의 정보 가져옴
        // 키워드 존재여부 확인
        const keywordInfo = await KeywordGetFromId(StrToObjectId(requestQuery.keywordId, 'KEYWORD'))
        if (keywordInfo == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }

        // gpt 프롬프트를 위한 키워드 정보 추출
        const languageOrder = ['en', 'ko', 'ja', 'zh', 'es', 'fi', 'fr']
        let promptKeyword: string | undefined
        let promptLanguage: string | undefined
        for (const l of languageOrder) {
          const k = keywordInfo.trans.find((k) => k.language === l)
          if (k != null) {
            promptLanguage = l
            promptKeyword = k.word
            break
          }
        }
        if (promptKeyword == null || promptLanguage == null) {
          throw new ExError('keyword not available', {
            type: 'int',
            code: 'KEYWORD_NOT_AVAILABLE',
            info: {
              keywordId: keywordInfo._id.toHexString(),
              trans: JSON.stringify(keywordInfo.trans),
            },
          })
        }

        promptInfo = {
          keyword: promptKeyword,
          language: promptLanguage,
        }
      }

      // 요청과 동일한 카테고리가 존재하는지 확인
      let categoryId: ObjectId | undefined
      if (requestQuery.category != null) {
        const categoryInfo = await CategoryGetWithWord(requestQuery.language, requestQuery.category)
        if (categoryInfo == null) {
          throw new ExError('category not existed', {
            type: 'ext',
            code: 'CATEGORY_NOTFOUND',
          })
        }
        promptInfo.category = requestQuery.category
        categoryId = categoryInfo._id
      }

      const languageMap = {
        ko: 'korean',
        en: 'english',
        ja: 'japanese',
        zh: 'chinese',
        es: 'spanish',
        fi: 'finnish',
        fr: 'french',
      }

      // gpt에게 퀴즈 질의
      const prompt = `give me a quiz.

The conditions for the target students are as follows.
1. subject for question: ${promptInfo.category == null ? '' : `${promptInfo.category} / `}${
        promptInfo.keyword
      } (${languageMap[promptInfo.language as 'ko']}) - use it for each language
2. age: ${requestQuery.age}
3. gender: ${requestQuery.gender}
4. level of knowledge: ${requestQuery.level} (between 1 and 5)

all questions and options must translate to ${
        requestQuery.needConfirm
          ? `${Object.entries(languageMap).length} languages - ${Object.entries(languageMap)
              .map((l) => l[1])
              .join(',')}.`
          : `${languageMap[promptInfo.language as 'ko']} only.`
      }

The problem consists of the following contents.
Make sure that all fields and array elements are not missing.
1. question(q) - an array of information for each unique language. array length is equal with number of translate languages - ISO 639-1 language Code(l) / text(t)
2. 4 choices(c) - an array of information for each unique language.  array length is equal with number of translate languages - ISO 639-1 language Code(l) / array of text(t)
3. Position of the correct answer among the options (a) - Numeric value. The location of the correct answer for every problem must always be random.
4. A single word keyword for each choice image${
        requestQuery.age <= 10
          ? '. required. (k) - '
          : ' to be used if the image is appropriate when expressing the choices (k) - Not required if the image is inappropriate.'
      } Always translated into English.


Give the response as json like below. it must be a completely valid json document. do not include javascript comment.
{
  "q" : [{l:"",t:""}],
  "c" : [{l:"",t:["","","",""]}],
  "k" : ["","","",""],
  "a" : ""
}
`
      // console.log(prompt)

      // GPT 질의
      let resRaw = await OpenAiAsk(prompt, true)
      // if (Array.isArray(resRaw)) {
      //   throw new ExError('gpt answer is wrong format', {
      //     type: 'int',
      //     code: 'OPENAI_WRONG',
      //     info: { message: prompt, response: JSON.stringify(resRaw) },
      //   })
      // }

      let res: resBodyType = { quiz: [] }
      try {
        const raw = JSON.parse(resRaw[0] === '{' ? resRaw : resRaw.substring(resRaw.indexOf('{')))
        let imageUrl: string[] | undefined = undefined
        if (
          Array.isArray(raw.k) &&
          (raw.k?.length ?? 0) > 1 &&
          raw.k?.every((k: string) => k != null && k !== '')
        ) {
          imageUrl = (raw.k as string[]).map(
            (k) =>
              `https://source.unsplash.com/500x500/?${
                requestQuery.language === 'en' ? `${requestQuery.keyword},` : ''
              }${k.replaceAll(' ', ',')}`,
          )
        }
        const answer = parseInt(raw.a)
        if (
          Number.isNaN(answer) ||
          answer < 0 ||
          answer > 3 ||
          raw.c.some((q: any) => !Array.isArray(q.t) || q.t.length !== 4)
        ) {
          throw new Error('wrong answer')
        }
        res.quiz.push({
          question: raw.q.map((q: any) => ({ language: q.l, text: q.t })),
          choice: raw.c.map((q: any) => ({ language: q.l, text: q.t })),
          answer: answer,
          imageUrl: imageUrl,
        })
      } catch (e) {
        throw new ExError('gpt answer is wrong format', {
          type: 'int',
          code: 'OPENAI_WRONG',
          info: { message: prompt, response: JSON.stringify(resRaw) },
          err: e,
        })
      }

      // 언어별 후보정
      const languageArr = {
        ko: ['ko', 'korean', 'kor', 'korea', 'kr'],
        en: ['en', 'english', 'eng', 'america', 'us'],
        ja: ['ja', 'japanese', 'eng', 'japan', 'jp'],
        zh: ['zh', 'chinese', 'jpn', 'china', 'cn'],
        es: ['es', 'spanish', 'spa', 'spain', 'es'],
        fi: ['fi', 'finnish', 'fin', 'finland', 'fi'],
        fr: ['fr', 'french', 'fra', 'france', 'fr'],
      }
      if (request.query.needConfirm) {
        res.quiz.forEach((q) => {
          const questions: { language: string; text: string }[] = []
          const choices: { language: string; text: string[] }[] = []
          for (const l of Object.entries(languageArr)) {
            const question = q.question.find((iq) => l[1].includes(iq.language))
            const choice = q.choice.find((cq) => l[1].includes(cq.language))
            if (question != null && choice != null) {
              questions.push({ language: l[0], text: question.text })
              choices.push({ language: l[0], text: choice.text })
            } else if (l[0] === 'en') {
              // 전체언어 요청이라면 최소한 영어 언어는 있어야함
              throw new ExError('gpt answer is not containe required language', {
                type: 'int',
                code: 'OPENAI_WRONG',
                info: { message: prompt, response: JSON.stringify(q), requiredLanguage: 'en' },
              })
            }
          }
          q.question = questions
          q.choice = choices
        })
      } else {
        res.quiz.forEach((q) => {
          const question = q.question.find((iq) =>
            languageArr[requestQuery.language as 'ko'].includes(iq.language),
          )
          const choice = q.choice.find((cq) =>
            languageArr[requestQuery.language as 'ko'].includes(cq.language),
          )
          if (question == null || choice == null) {
            // 요청 내용과 동일한 언어가 있어야함
            throw new ExError('gpt answer is not containe required language', {
              type: 'int',
              code: 'OPENAI_WRONG',
              info: {
                message: prompt,
                response: JSON.stringify(q),
                requiredLanguage: requestQuery.language,
              },
            })
          }
          q.question = [{ language: requestQuery.language!, text: question.text }]
          q.choice = [{ language: requestQuery.language!, text: choice.text }]
        })
      }

      // 문제바로 확정 필요시 바로 저장
      if (requestQuery.needConfirm) {
        // 이미지 확정
        await Promise.all(
          res.quiz.map(async (q) => {
            if (q.imageUrl == null) {
              return
            }
            q.imageUrl = await Promise.all(
              q.imageUrl.map(async (u) => {
                return await getHttpRedirectAddr(u)
              }),
            )
          }),
        )

        // 키워드 저장
        if (keywordId == null) {
          keywordId = await KeywordInsert(requestQuery.language!, requestQuery.keyword!)
        }

        // 퀴즈 저장
        try {
          const insertResult = await CollQuiz.insertOne({
            keywordId: keywordId,
            gender: requestQuery.gender,
            age: requestQuery.age,
            level: requestQuery.level,
            categoryId: categoryId,
            question: res.quiz.map((q) => ({
              ...q,
              correctCount: 0,
              tryCount: 0,
            })),
            creator: classId ?? userId,
            creatorType: classId == null ? 'std' : 'class',
            createDate: new Date(),
            ratingCount: 0,
            rating: 0,
            isSearchable: false,
            statCount: 0,
            statAvgAgeLearn: 0,
            statAvgAgeCognative: 0,
            statAvgAgeActivity: 0,
          })
          res.id = insertResult.insertedId.toHexString()
        } catch (e) {
          throw new ExError('failed to insert agreement', {
            type: 'int',
            code: 'DB_INSERT_AGREEMENT',
            err: e,
          })
        }
      }

      // API 응답
      reply.send(res)
    },
  })
}

const getHttpRedirectAddr = async (url: string) => {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    if (response.status === 302 || response.status === 301) {
      // console.log(`${url} ==>> ${response.headers.get('location')}`)
      return response.headers.get('location') as string // redirection 주소 반환
    } else {
      return url // 만약 redirection이 발생하지 않으면 원래 URL을 반환
    }
  } catch (e) {
    throw new ExError('failed to get keyword', {
      type: 'int',
      code: 'HTTP_IMG_REDIRECTION',
      err: e,
      info: { url: url },
    })
  }
}

// 문제 api에 GPT문서 별 1~5개 추가

// 문제은행목록 : 나이() 난이도() 주제() 동일
// 내가 푼 문제 안푼문제
// 퀴즈바꾸기 api

// ai문 (난이도 보강)

// 게임시작한다! API

// 문제풀기
// --------------
// 다음문제 얻어오기 API - 문제풀기 시작할때 - 플레이스타일 상관없이
// AI 3개 (연속)
// 1. 동일주제 추가난이도 (+1)
// 2. 동일주제 이전게임 난이도 (+2)
// 3. 동일주제 이전게임 난이도 (+3)
// 문제은행 (3개) - 인기순
// 인기순 - 같은주제 나이() 난이도() 동일? -> 기준 맘대로
// ------------

// 퀴즈 수정 (+업로드)
// 퀴즈 목록
// 점수 매기기
// 결과 보고 + history

// 싱글모드 - 문제목록 or GPT() (무조건 확정) => 풀이
// 싱글모드 - 결과 처리
// 멀티모드 - 내가 받은 초대 확인 with 방기본정보
// 멀티모드 - 방참여 / 방상세정보
// 멀티모드 - DB 처리 gpt 처리
