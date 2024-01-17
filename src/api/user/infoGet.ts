import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollUser, SchemaUser } from '../../db/user'
import { CollUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, CtxUserType, RegisterApi } from '../common'
import { PointGetCurrent } from '../point/_service'

const resBody = Type.Object({
  userId: Type.Optional(
    Type.String({
      description: '유저 id',
      minLength: 1,
    }),
  ),
  email: Type.Optional(
    Type.String({
      description: '유저 이메일',
      minLength: 1,
    }),
  ),
  joinDate: Type.Optional(
    Type.Number({
      description: '가입시간',
      examples: [1689013812],
      minimum: 1,
    }),
  ),
  type: Type.Enum<{ student: 'std'; organization: 'org' }>(
    {
      student: 'std',
      organization: 'org',
    },
    { description: '유저 종류 - std(유저),org(기관)', examples: ['std'] },
  ),
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
  language: Type.Optional(
    Type.String({
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    }),
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
  point: Type.Optional(
    Type.Number({
      description: '학생정보 - 포인트',
    }),
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
  imgUrl: Type.Optional(
    Type.String({
      description: '프로필 사진 url',
    }),
  ),
  findId: Type.Optional(
    Type.String({
      description: '검색 id',
    }),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiUserInfoGet: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Reply: resBodyType }>({
    method: 'get',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['유저'],
      summary: '유저 정보 요청.',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      if (userType === 'admin') {
        throw new ExError('user type is wrong', {
          type: 'int',
          code: 'USER_INFO_TYPE_WRONG',
        })
      }

      // 유저 검색
      let userInfo: WithId<SchemaUser> | null = null
      try {
        userInfo = await CollUser.findOne({
          _id: userId,
        })
      } catch (e) {
        throw new ExError('failed to get user', {
          type: 'int',
          code: 'DB_GET_USER',
          err: e,
        })
      }
      if (userInfo == null) {
        throw new ExError('user type is wrong', {
          type: 'int',
          code: 'USER_INFO_NOTFOUND',
        })
      }

      let findId: string | undefined
      if (userType === 'std') {
        try {
          const existedFindId = await CollUserFindId.findOne({ userId: userId })
          if (existedFindId != null) {
            findId = existedFindId.name
          }
        } catch (e) {
          throw new ExError('fail to search findID', {
            type: 'int',
            code: 'DB_USER_FINDID',
            err: e,
          })
        }
      }

      // 정보 정제
      const result: resBodyType = {
        userId: userInfo._id.toHexString(),
        email: userInfo.email,
        type: userType,
      }
      if (userInfo.joinDate != null) {
        result.joinDate = Math.round(userInfo.joinDate.getTime() / 1000)
      }
      if (userInfo?.name != null) {
        result.name = userInfo.name
      }
      if (userInfo?.country != null) {
        result.country = userInfo.country
      }
      if (userInfo?.lang != null) {
        result.language = userInfo.lang
      }
      if (userInfo?.name != null) {
        result.name = userInfo.name
      }
      if (userInfo?.imgUrl != null) {
        result.imgUrl = userInfo.imgUrl
      }
      if (findId != null) {
        result.findId = findId
      }
      if (userType === 'std') {
        result.birth =
          userInfo.birth == null ? undefined : Math.round(userInfo.birth.getTime() / 1000)
        result.targetAge = userInfo.targetAge
        result.interest = userInfo.interest
        result.gender = userInfo.gender
        result.point = await PointGetCurrent(userInfo._id)
      } else {
        result.postCode = userInfo.postCode
        result.address1 = userInfo.address1
        result.address2 = userInfo.address2
      }

      // API 응답
      reply.send(result)
    },
  })
}
