import { Static, Type } from '@fastify/type-provider-typebox'
import { plainToClass } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  validateSync,
} from 'class-validator'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { CollQuiz, SchemaQuizQuestion } from '../../db/quiz'
import { AwsS3PutObject } from '../../util/awsS3'
import { Env } from '../../util/env'
import { ExError } from '../../util/error'
import { OpenAiAsk } from '../../util/openAi'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetFromId, KeywordGetWithWord, KeywordInsert } from '../subject/_service'

// 파일 업로드에 대한 스키마 정의
const reqBodyFile = Type.Object({
  // encoding: Type.String(),
  filename: Type.String(),
  // mimetype: Type.String(),
  // data: Type.Any(), // Buffer
  data: Type.Any(), // Buffer
  // type: Type.Optional(Type.String()),
})

const reqBody = Type.Object({
  uploadImages: Type.Optional(
    Type.Any(),
    // Type.Array(reqBodyFile, {
    //   maxItems: 40,
    //   description: '변경되는 파일 업로드. swagger로는 테스트 불가',
    // }),
  ),
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
        '문제의 언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  category: Type.Optional(
    Type.String({
      description: '카테고리명',
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
  quiz: Type.String({
    minLength: 2,
    description: `퀴즈본문에 대한 json 문자열
imageUrl 중 "upload"로 두면, 문제/선택지 순서대로 "uploadImages" 파일리스트에서 맞춰 업로드 처리함
--------- 예제 ---------
[
  // 문제1
  {
    "question" : "문제내용",
    "choice" : ["선택지1", "선택지2", ...],
    "imageUrl" : ["선택지1url", "upload", ...],
    "answer" : 3 // 0~3 중 하나
  }
]
...`,
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  id: Type.String({ description: '퀴즈 id' }),
  imageUrl: Type.Optional(
    Type.Array(
      Type.Any({
        description: '선택지에 대한 이미지 url',
      }),
      {
        description:
          '문제별/선택지 별 이미지 url 이중배열. 업로드 등 서버처리로 인한 변경시에만 줌',
      },
    ),
  ),
})
type resBodyType = Static<typeof resBody>

@ValidatorConstraint()
export class ImageUrlValidate implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
    return (
      typeof text === 'string' &&
      text.length >= 6 &&
      (text === 'upload' || text.startsWith('https://'))
    )
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return 'not available url'
  }
}
class reqBodyQuizSchema {
  @IsNotEmpty()
  @IsString()
  question: string

  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsNotEmpty({
    each: true,
  })
  choice: string[]

  @IsOptional()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @Validate(ImageUrlValidate, { each: true })
  imageUrl?: string[]

  @IsNumber()
  @Min(0)
  @Max(3)
  answer: number
}

export const ApiQuizConfirm: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: resBodyType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['퀴즈'],
      summary: '퀴즈 확정',
      description: `[ 400에러 코드 ]

      . PARAM_KEYWORD_VALIDATE : 키워드 관련 요청 파마리터가 잘못됨
      . KEYWORD_WRONG_ID : 요청 내 keyword id 형식이 잘못됨
      . KEYWORD_NOTFOUND : 요청 내 keyword id 가 존재하지 않음
      . QUIZ_WRONG : 요청 내 퀴즈 정보 string이 잘못됨

[ GPT 관련 500 에러코드 ]

      . OPENAI_FAILED : gpt 요청 실패
      . OPENAI_TIMEOUT : gpt 요청에서 timeout 발생
      . OPENAI_WRONG : gpt 응답 내용이 잘못되서 처리 불가
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const requestBody = request.body

      // 키워드 검증
      // 요청 조건확인 - 키워드 id 와 다른 필드들 정보가 중복되는지 확인
      if (
        (requestBody.keywordId != null &&
          [requestBody.keyword, requestBody.language].some((p) => p != null)) ||
        (requestBody.keywordId == null &&
          [requestBody.keyword, requestBody.language].some((p) => p == null))
      ) {
        throw new ExError('param keyword validation', {
          type: 'ext',
          code: 'PARAM_KEYWORD_VALIDATE',
        })
      }

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (requestBody.classId != null) {
        classId = StrToObjectId(requestBody.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      await ClassCheckAvailable(userType, userId, classId)

      // 카테고리 검증
      let categoryId: ObjectId | undefined = undefined
      if (requestBody.category != null) {
        const categoryInfo = await CategoryGetWithWord(requestBody.language, requestBody.category)
        if (categoryInfo == null) {
          throw new ExError('category not existed', {
            type: 'ext',
            code: 'CATEGORY_NOTFOUND',
          })
        }
        categoryId = categoryInfo._id
      }

      // 퀴즈 검증
      let quizs: reqBodyQuizSchema[] = []
      let uploadCount = 0
      let rawQuiz: Record<string, any>[]
      try {
        rawQuiz = JSON.parse(requestBody.quiz)
      } catch (e) {
        throw new ExError('quiz string is not valid json', {
          type: 'ext',
          code: 'QUIZ_WRONG',
          info: { quizParam: requestBody.quiz },
          err: e,
        })
      }
      if (!Array.isArray(rawQuiz)) {
        // || rawQuiz.length !== 10) {
        throw new ExError('quiz string is not json array', {
          type: 'ext',
          code: 'QUIZ_WRONG',
          info: { quizParam: requestBody.quiz },
        })
      }
      for (const r of rawQuiz) {
        const quiz = plainToClass(reqBodyQuizSchema, r)
        const quizValidationError = validateSync(quiz)
        if (quizValidationError.length > 0) {
          throw new ExError('quiz format validation failed', {
            type: 'ext',
            code: 'QUIZ_WRONG',
            info: { errors: JSON.stringify(quizValidationError) },
          })
        }
        if (quiz.imageUrl != null)
          quiz.imageUrl.forEach((u) => {
            if (u === 'upload') {
              uploadCount++
            }
          })
        quizs.push(quiz)
      }
      if (uploadCount !== (requestBody.uploadImages?.length ?? 0)) {
        throw new ExError('upload count and uploaded filed count not match', {
          type: 'ext',
          code: 'QUIZ_WRONG',
          info: {
            uploadChoiceCount: uploadCount,
            uploadFileCount: requestBody.uploadImages?.length ?? 'none',
          },
        })
      }

      // 키워드 id 검증
      let keywordId: ObjectId | undefined
      if (requestBody.keywordId != null) {
        keywordId = (await KeywordGetFromId(StrToObjectId(requestBody.keywordId, 'KEYWORD')))?._id
        if (keywordId == null) {
          throw new ExError('keyword not existed', {
            type: 'ext',
            code: 'KEYWORD_NOTFOUND',
          })
        }
      }

      // 번역 요청
      const languageMap = {
        ko: 'korean',
        en: 'english',
        ja: 'japanese',
        zh: 'chinese',
        es: 'spanish',
        fi: 'finnish',
        fr: 'french',
      }

      const resultQuiz = await Promise.all(
        quizs.map(async (q): Promise<SchemaQuizQuestion> => {
          const prompt = `Translate all ${
            languageMap[requestBody.language]
          } string values in the json document below.
  
${JSON.stringify({ q: q.question, c: q.choice })}
  
Target language is korean,english,japanese,chinese,spanish,finnish,french.
Give the answer as json in list format like this.
Make sure that all fields and array elements are not missing.
Don't miss translate text for each language.
You Must escape doule quotes in string.
"l" field means each target language code. fill "t" field with translated string.

{
  "q" : [
    { "l":"ko", "t":<translated string for korean> },
    { "l":"en", "t":<translated string for english> },
    { "l":"ja", "t":<translated string for japanese> },
    { "l":"zh", "t":<translated string for chinese> },
    { "l":"es", "t":<translated string for spanish> },
    { "l":"fi", "t":<translated string for finnish> },
    { "l":"fr", "t":<translated string for french> }
  ],
  "c" : [
    { "l":"ko", "t":<translated string array for korean> },
    { "l":"en", "t":<translated string array for english> },
    { "l":"ja", "t":<translated string array for japanese> },
    { "l":"zh", "t":<translated string array for chinese> },
    { "l":"es", "t":<translated string array for spanish> },
    { "l":"fi", "t":<translated string array for finnish> },
    { "l":"fr", "t":<translated string array for french> }
  ]
}
`
          console.log(prompt)
          let raw: Record<string, any>
          const resRaw = await OpenAiAsk(prompt)
          try {
            // if (Array.isArray(resRaw)) {
            //   throw new Error('gpt response is Array')
            // }
            raw = JSON.parse(resRaw)
            if (
              !Array.isArray(raw.q) ||
              !Array.isArray(raw.c) ||
              raw.q.some((rq) => typeof rq.l !== 'string' || typeof rq.t !== 'string') ||
              raw.c.some(
                (rc) => typeof rc.l !== 'string' || !Array.isArray(rc.t) || rc.t.length !== 4,
              )
            ) {
              throw new Error('gpt response format is Wrong')
            }
          } catch (e) {
            throw new ExError('gpt answer is wrong format', {
              type: 'int',
              code: 'OPENAI_WRONG',
              info: { message: prompt, response: JSON.stringify(resRaw) },
              err: e,
            })
          }
          return {
            question: raw.q.map((rq) => ({ language: rq.l, text: rq.t })),
            choice: raw.c.map((rc) => ({ language: rc.l, text: rc.t })),
            imageUrl: q.imageUrl,
            answer: q.answer,
            correctCount: 0,
            tryCount: 0,
          }
        }),
      )

      // 이미지 업로드 처리
      if (uploadCount > 0 && requestBody.uploadImages != null) {
        const getNextPos = (uploadPos: [number, number] | null): [number, number] | null => {
          if (uploadPos == null) {
            return null
          }
          for (let i = uploadPos[0] ?? 0; i < resultQuiz.length; i++) {
            const imageUrls = resultQuiz[i].imageUrl
            if (Array.isArray(imageUrls)) {
              // console.log(Object.entries(imageUrls))
              for (let j = uploadPos[1] + 1; j < 4; j++) {
                // console.log(`checking.. ${imageUrls[j]}`)
                if (imageUrls[j] === 'upload') {
                  // console.log(`gotcha!! ${i} - ${j}`)
                  return [i, j]
                }
              }
            }
            uploadPos[1] = -1
          }
          return null
        }

        let uploadPos: [number, number] | null = [0, -1]
        for (const i of requestBody.uploadImages) {
          uploadPos = getNextPos(uploadPos)
          if (uploadPos == null) {
            break
          }
          // console.log(i)
          // await SlackSendMessage(i)
          // await SlackSendMessage(JSON.stringify(i))
          // console.log(`POS : ${uploadPos}`)
          const filename = `${new Date().getTime()}_${uploadPos[0]}_${
            uploadPos[1]
          }.${i.filename.substring(i.filename.lastIndexOf('.') + 1, i.filename.length)}`
          await AwsS3PutObject(
            `${Env().env === 'prd' ? 'prd' : 'dev'}-spody-images`,
            `quiz/${filename}`,
            i.data,
            // i.value,
          )
          resultQuiz[uploadPos[0]].imageUrl![uploadPos[1]] = `https://${
            Env().env === 'prd' ? '' : 'dev-'
          }image.z-meal.com/quiz/${filename}`
        }
      }

      // 키워드 DB 저장
      if (keywordId == null) {
        keywordId = (await KeywordGetWithWord(requestBody.language!, requestBody.keyword!))?._id
      }
      if (keywordId == null) {
        keywordId = await KeywordInsert(requestBody.language!, requestBody.keyword!)
      }

      // 문제 DB 저장
      let quizId: string
      try {
        const insertReulst = await CollQuiz.insertOne({
          keywordId: keywordId,
          categoryId: categoryId,
          gender: requestBody.gender,
          age: requestBody.age,
          level: requestBody.level,
          question: resultQuiz,
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
        quizId = insertReulst.insertedId.toHexString()
      } catch (e) {
        throw new ExError('failed to insert agreement', {
          type: 'int',
          code: 'DB_INSERT_AGREEMENT',
          err: e,
        })
      }

      // API 응답
      reply.send({
        id: quizId,
        imageUrl:
          uploadCount > 0 && requestBody.uploadImages != null
            ? resultQuiz.map((q) => q.imageUrl)
            : undefined,
      })
    },
  })
}
