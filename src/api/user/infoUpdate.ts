import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { MatchKeysAndValues } from 'mongodb'
import { CollUser, SchemaUser } from '../../db/user'
import { CollUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, CtxUserType, RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

const reqBody = Type.Object({
  name: Type.Optional(
    Type.String({
      description: '유저이름 및 기관명',
      minLength: 1,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description: '유저 국가',
      minLength: 1,
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
  birth: Type.Optional(
    Type.Number({
      description: '학생정보 - 생년월일 (unix time)',
      examples: [1689013812],
      minimum: 1,
    }),
  ),
  targetAge: Type.Optional(
    Type.Number({
      description: '학생정보 - 목표연령(나이)',
      minimum: 1,
    }),
  ),
  interest: Type.Optional(
    Type.Array(Type.String(), {
      description: '학생정보 - 관심사',
      minItems: 3,
    }),
  ),
  gender: Type.Optional(
    Type.Enum<{ male: 'male'; female: 'female' }>(
      {
        male: 'male',
        female: 'female',
      },
      { description: '학생정보 - male(남자),female(여자)', examples: ['male'] },
    ),
  ),
  postCode: Type.Optional(
    Type.String({
      description: '기관정보 - 우편번호',
      examples: ['20312'],
      minLength: 5,
    }),
  ),
  address1: Type.Optional(
    Type.String({
      description: '기관정보 - 기본 주소',
      minLength: 5,
    }),
  ),
  address2: Type.Optional(
    Type.String({
      description: '기관정보 - 상세 주소',
      minLength: 5,
    }),
  ),
  findId: Type.Optional(
    Type.String({
      description: '검색id. 기관일 경우엔 반 생성시 id추가',
      minLength: 5,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiUserInfoUpdate: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['유저'],
      summary: '유저 정보 업데이트. 유저 종류에 맞는 내용으로 요청해야함',
      description: `[ 400에러 코드 ]

      . USER_INFO_TYPE_WRONG : 유저 종류와 맞지 않는 내용이 있음
      . USER_INFO_NO_CHANGE : 수정할 정보가 없음
      . FINDID_DUPLICATE : 동일한 검색id가 이미 있음

      [ 유저 종류 별 관련 body 필드]
      
      . std(학생) : ['name', 'birth', 'gender', 'interest', 'targetAge']
      . org(기관) : ['name', 'postCode', 'address1', 'address2']
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userType = CtxUserType(request)
      const requestBody = request.body
      if (
        userType === 'admin' ||
        (userType === 'std' &&
          [requestBody.postCode, requestBody.address1, requestBody.address2].some(
            (p) => p != null,
          )) ||
        (userType === 'org' &&
          [requestBody.birth, requestBody.gender, requestBody.interest, requestBody.targetAge].some(
            (p) => p != null,
          ))
      ) {
        throw new ExError('user type is wrong', {
          type: 'ext',
          code: 'USER_INFO_TYPE_WRONG',
        })
      }

      // 업데이트 데이터 정리
      const update: MatchKeysAndValues<SchemaUser> = {}
      for (const k of userType === 'std'
        ? ['name', 'country', 'language', 'birth', 'gender', 'interest', 'targetAge']
        : ['name', 'country', 'language', 'postCode', 'address1', 'address2']) {
        const value = requestBody[k as keyof reqBodyType]
        if (value != null) {
          update[k === 'language' ? 'lang' : k] = k === 'birth' ? new Date(value as number) : value
        }
      }
      if (Object.entries(update).length < 1 && (userType === 'org' || requestBody.findId == null)) {
        throw new ExError('nothing change', {
          type: 'ext',
          code: 'USER_INFO_NO_CHANGE',
        })
      }

      const userId = CtxUserId(request)

      // 학생일 경우에만 추가로 검색id 업데이트
      if (userType === 'std' && requestBody.findId != null) {
        try {
          await CollUserFindId.findOneAndUpdate(
            { userId: userId },
            { $set: { name: requestBody.findId }, $setOnInsert: { userId: userId } },
            { upsert: true },
          )
        } catch (e) {
          if ((e as Error).message.includes('E11000 duplicate key error')) {
            throw new ExError('failed to upsert find id', {
              type: 'ext',
              code: 'FINDID_DUPLICATE',
              err: e,
            })
          }
          throw new ExError('failed to upsert find id', {
            type: 'int',
            code: 'DB_UPSERT_FINDID',
            err: e,
          })
        }
      }

      // 유저정보 업데이트
      if (Object.entries(update).length > 0) {
        try {
          await CollUser.findOneAndUpdate({ _id: userId }, { $set: update })
        } catch (e) {
          throw new ExError('failed to update user', {
            type: 'int',
            code: 'DB_UPDATE_USER',
            err: e,
            info: {
              userId: userId.toHexString(),
            },
          })
        }
      }

      // TODO: 이름이 업데이트됐다면, 팔로우에서 이름 업데이트

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
