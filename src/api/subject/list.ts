import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollSubject, SchemaSubject } from '../../db/subject'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { CollKeyword, SchemaKeyword } from '../../db/keyword'

const reqQuery = Type.Object({
  language: Type.Optional(
    Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
      { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
      {
        description:
          '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
        examples: ['ko'],
      },
    ),
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
  subject: Type.Array(
    Type.Object({
      id: Type.String({
        description: '과목 id',
        minLength: 1,
      }),
      keywordId: Type.String({
        description: '과목명 id',
        minLength: 1,
      }),
      keyword: Type.String({
        description: '과목명',
        minLength: 1,
      }),
      category: Type.Optional(
        Type.Number({
          description: '카테고리명',
        }),
      ),
      favorite: Type.Boolean({
        description: '관심과목 여부',
      }),
      startAge: Type.Number({
        description: '시작 나이',
      }),
      targetAge: Type.Number({
        description: '목표 나이',
      }),
      currentAge: Type.Number({
        description: '현재 나이',
      }),
      currentLevel: Type.Number({
        description: '목표 나이',
      }),
      tryCount: Type.Number({
        description: '문제풀이 횟수',
      }),
      createdAt: Type.Number({
        description: '생성일 (unix time 초단위)',
        examples: [1689013812],
      }),
    }),
    { description: '유저/반의 과목 리스트' },
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiSubjectList: RegisterApi = (
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
      summary: '유저/반의 과목 목록 요청',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (request.query.classId != null) {
        classId = StrToObjectId(request.query.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 해당 학생/반의 과목들 검색
      let subjects: WithId<SchemaSubject>[]
      try {
        subjects = await CollSubject.find({
          userId: userType === 'std' ? userId : classId,
          userType: userType === 'std' ? 'std' : 'class',
        }).toArray()
      } catch (e) {
        throw new ExError('fail to list subject', {
          type: 'int',
          code: 'DB_LIST_SUBJECT',
          err: e,
        })
      }

      // 언어가 동일한지 확인
      const reqLanguage = request.query.language
      if (reqLanguage != null) {
        type KeywordForLang = { keywordId: ObjectId; keyword?: string }
        const keywordForLang = subjects
          .filter((s) => s.keywordLanguage !== request.query.language)
          .map((s): KeywordForLang => ({ keywordId: s.keywordId }))

        // 언어 변경 대상 subject가 있다면, 키워드 매칭 검색으로 해당언어로 변경
        if (keywordForLang.length > 0) {
          // DB 검색
          let keywords: WithId<SchemaKeyword>[] | undefined
          try {
            keywords = await CollKeyword.find({
              _id: { $in: keywordForLang.map((s) => s.keywordId) },
            }).toArray()
          } catch (e) {
            throw new ExError('fail to get keywords', {
              type: 'int',
              code: 'DB_LIST_KEYWORDS',
              err: e,
            })
          }

          // 해당 언어로 변경. 없으면 en으로
          for (const k of keywords) {
            const targetKeyword = keywordForLang.find((l) => l.keywordId.equals(k._id))
            if (targetKeyword != null) {
              targetKeyword.keyword =
                k.trans.find((t) => t.language === reqLanguage)?.word ??
                k.trans.find((t) => t.language === 'en')?.word
            }
          }

          // 기존 결과에서 바꿔치기
          for (const d of keywordForLang) {
            const targetSubject = subjects.find((s) => s.keywordId.equals(d.keywordId))
            if (targetSubject != null && d.keyword != null) {
              targetSubject.keyword = d.keyword
            }
          }
        }
      }

      // API 응답
      reply.send({
        subject: subjects.map((s) => ({
          id: s._id.toHexString(),
          keywordId: s.keywordId.toHexString(),
          keyword: s.keyword,
          favorite: s.favorite,
          startAge: s.startAge,
          targetAge: s.targetAge,
          currentAge: s.currentAge,
          currentLevel: s.currentLevel,
          tryCount: s.tryCount ?? 0,
          createdAt: Math.round(s.createDate.getTime() / 1000),
        })),
      })
    },
  })
}
