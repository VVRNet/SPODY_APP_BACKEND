import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollClass, SchemaClass } from '../../db/class'
import { SchemaUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi } from '../common'
import { PointGetCurrent } from '../point/_service'

const resBody = Type.Object({
  list: Type.Array(
    Type.Object({
      id: Type.String({ description: '반 id', examples: ['64ad90e45aaeb63c51a82307'] }),
      name: Type.String({ description: '반 이름', examples: ['a반'] }),
      interest: Type.Array(Type.String(), { description: '관심사 목록' }),
      point: Type.Number({
        description: '보유 포인트',
      }),
      findId: Type.Optional(
        Type.String({
          description: '검색 id',
        }),
      ),
    }),
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiClassList: RegisterApi = (
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
      tags: ['반 (기관 전용)'],
      summary: '반 목록확인',
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
      type classWithFindId = SchemaClass & { findId: SchemaUserFindId[] }
      let classes: classWithFindId[]

      try {
        classes = await CollClass.aggregate<classWithFindId>([
          { $match: { userId: CtxUserId(request) } },
          {
            $lookup: {
              from: 'userFindId',
              localField: '_id',
              foreignField: 'classId',
              as: 'findId',
            },
          },
        ]).toArray()
      } catch (e) {
        throw new ExError('failed to get code', {
          type: 'int',
          code: 'DB_LIST_CLASS',
          err: e,
        })
      }

      const classInfos = await Promise.all(
        classes.map(async (c) => ({
          id: c._id?.toHexString() ?? '',
          name: c.name,
          interest: c.interest ?? [],
          point: await PointGetCurrent(c.userId, c._id),
          findId: c.findId?.[0]?.name,
        })),
      )

      // API 응답
      reply.send({
        list: classInfos,
      })
    },
  })
}
