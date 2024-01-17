import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { SchemaClass } from '../../db/class'
import { SchemaUser } from '../../db/user'
import { CollUserFindId, SchemaUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { RegisterApi } from '../common'

const reqQuery = Type.Object({
  findId: Type.String({
    description: '검색id',
    minLength: 1,
  }),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Array(
  Type.Object({
    id: Type.String({
      description: '학생/반의 id',
    }),
    type: Type.Enum<{ student: 'std'; class: 'class' }>(
      { student: 'std', class: 'class' },
      {
        description: '학생/반 여부',
        examples: ['std'],
      },
    ),
    name: Type.String({
      description: '학생/반의 이름',
    }),
    orgName: Type.Optional(
      Type.String({
        description: '반일경우, 기관의 이름',
      }),
    ),
    country: Type.Optional(
      Type.String({
        description: '학생/반의 국가정보',
      }),
    ),
    imgUrl: Type.Optional(
      Type.String({
        description: '프로필 사진 url',
      }),
    ),
  }),
)
type resBodyType = Static<typeof resBody>

export const ApiUserSearchFindId: RegisterApi = (
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
      summary: '유저 검색. 검색id로 텍스트 prefix검색.',
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      type findIdWithInfoType = SchemaUserFindId & {
        user: SchemaUser[]
        class: SchemaClass[]
      }
      // 유저 검색
      let users: findIdWithInfoType[]
      try {
        users = await CollUserFindId.aggregate<findIdWithInfoType>([
          { $match: { name: { $regex: `^${request.query.findId}` } } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'user',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
            },
          },
          {
            $lookup: {
              from: 'class',
              localField: 'classId',
              foreignField: '_id',
              as: 'class',
            },
          },
        ]).toArray()
      } catch (e) {
        throw new ExError('fail to search findID', {
          type: 'int',
          code: 'DB_USER_FINDID',
          err: e,
        })
      }

      reply.send(
        users.map((u) => {
          const userInfo = u.user[0]
          const classInfo = u.class[0]
          const userType = classInfo == null ? 'std' : 'class'
          const targetInfo = userType === 'std' ? userInfo : classInfo
          return {
            id: targetInfo._id?.toHexString() ?? '',
            name: targetInfo.name ?? '',
            orgName: userType === 'class' ? userInfo.name ?? '' : '',
            type: userType,
            imgUrl: userInfo.imgUrl,
            country: userInfo.country,
          }
        }),
      )
    },
  })
}
