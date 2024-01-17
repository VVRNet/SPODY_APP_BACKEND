import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import { CollClass, SchemaClass } from '../../db/class'
import { CollUser, SchemaUser } from '../../db/user'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  email: Type.Optional(
    Type.String({
      description: '유저이메일. email이 정확히 일치해야함.',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  id: Type.String({
    description: '학생/기관의 id',
  }),
  name: Type.String({
    description: '학생/기관의 이름',
  }),
  type: Type.Enum<{ student: 'std'; org: 'org' }>(
    { student: 'std', org: 'org' },
    {
      description: '학생/기관 여부',
      examples: ['std'],
    },
  ),
  address: Type.Optional(
    Type.String({
      description: '기관일 경우, 기관의 주소',
    }),
  ),
  class: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String({ description: '반 id' }),
        name: Type.String({ description: '반 이름', examples: ['a반'] }),
      }),
      { description: '기관일 경우, 보유 반의 정보를 알려줌' },
    ),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiUserSearchEmail: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: `${url}`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['유저'],
      summary: '유저 검색. 이메일이 매칭되는 유저를 알려줌.',
      description: `[ 400에러 코드 ]
      
      . USER_EMAIL_NOTFOUND : 해당 이메일의 유저 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 유저 검색
      let userInfo: WithId<SchemaUser> | null = null
      try {
        userInfo = await CollUser.findOne({
          email: request.query.email,
        })
      } catch (e) {
        throw new ExError('failed to get user', {
          type: 'int',
          code: 'DB_GET_USER',
          err: e,
          info: {
            email: request.query.email,
          },
        })
      }
      if (userInfo == null) {
        throw new ExError('user not existed', {
          type: 'ext',
          code: 'USER_EMAIL_NOTFOUND',
        })
      }

      // 기관일경우, 기관 소속 반 검색
      let classes: SchemaClass[] | undefined = undefined
      if (userInfo.type === 'org') {
        try {
          classes = await CollClass.find<SchemaClass>({ userId: userInfo._id }).toArray()
        } catch (e) {
          throw new ExError('failed to get code', {
            type: 'int',
            code: 'DB_LIST_CLASS',
            err: e,
          })
        }
      }

      // API 응답
      reply.send({
        id: userInfo._id.toHexString(),
        name: userInfo.name ?? '',
        type: userInfo.type,
        class: classes?.map((c) => ({ id: c._id?.toHexString() ?? '', name: c.name })),
        address: classes == null ? undefined : userInfo.address1,
      })
    },
  })
}
