import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { CollSubject } from '../../db/subject'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CategoryGetWithWord } from '../category/_service'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { KeywordGetWithWord, KeywordInsert } from './_service'

const reqBody = Type.Object({
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  keyword: Type.String({
    description: '과목명',
    minLength: 1,
    examples: ['운동'],
  }),
  category: Type.Optional(
    Type.String({
      description: '카테고리명',
      minLength: 1,
      examples: ['운동'],
    }),
  ),
  startAge: Type.Number({
    description: '시작 나이',
    minimum: 1,
  }),
  targetAge: Type.Number({
    description: '목표 나이',
    minimum: 1,
  }),
  favorite: Type.Boolean({
    description: '관심 과목 여부',
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
  subjectId: Type.String({ description: '과목 id' }),
})
type resBodyType = Static<typeof resBody>

export const ApiSubjectAdd: RegisterApi = (
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
      tags: ['과목'],
      summary: '과목 등록',
      description: `[ 400에러 코드 ]
      
      . PARAM_TYPE_NOTMATCH : 유저 종류와 요청내용이 안맞음 ex. 기관인데 반id가 없다든지
      . PARAM_AGE_WRONG : 나이정보가 잘못됨 - 목표나이가 시작나이보다 커야함
      . SUBJECT_ALREADY : 같은 이름의 과목이 이미 있음
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
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (requestBody.classId != null) {
        classId = StrToObjectId(requestBody.classId, 'CLASS')
      }

      // 나이 파라미터 검증
      const startAge = requestBody.startAge
      const targetAge = requestBody.targetAge
      if (startAge >= targetAge) {
        throw new ExError('age param wrong', {
          type: 'ext',
          code: 'PARAM_AGE_WRONG',
          info: {
            startAge: startAge,
            targetAge: targetAge,
          },
        })
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      const reqLanguage = requestBody.language
      const reqWord = requestBody.keyword

      // 같은 과목명의 과목이 존재하는지 확인
      try {
        const subject = await CollSubject.findOne({
          userId: userType === 'std' ? userId : classId,
          userType: userType === 'std' ? 'std' : 'class',
          keyword: reqWord,
          keywordLanguage: reqLanguage,
        })
        if (subject != null) {
          throw new ExError('same subject name already existed', {
            type: 'ext',
            code: 'SUBJECT_ALREADY',
          })
        }
      } catch (e) {
        if (ExError.isExError(e)) {
          throw e
        }
        throw new ExError('failed to insert keyword', {
          type: 'int',
          code: 'DB_GET_SUBJECT',
          err: e,
        })
      }

      // 요청과 동일한 카테고리가 존재하는지 확인
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

      // 등록
      let subjectId: ObjectId | null = null
      try {
        const subject = await CollSubject.insertOne({
          userId: userType === 'std' ? userId : classId!,
          userType: userType === 'std' ? 'std' : 'class',
          keywordId:
            (await KeywordGetWithWord(reqLanguage, reqWord))?._id ??
            (await KeywordInsert(reqLanguage, reqWord)),
          categoryId: categoryId,
          favorite: requestBody.favorite,
          startAge: requestBody.startAge,
          targetAge: requestBody.targetAge,
          currentAge: requestBody.startAge,
          currentLevel: 1,
          keyword: reqWord,
          keywordLanguage: reqLanguage,
          tryCount: 0,
          createDate: new Date(),
        })
        subjectId = subject.insertedId
      } catch (e) {
        throw new ExError('failed to insert keyword', {
          type: 'int',
          code: 'DB_INSERT_KEYWORD',
          err: e,
        })
      }

      // API 응답
      reply.send({
        subjectId: subjectId.toHexString(),
      })
    },
  })
}
