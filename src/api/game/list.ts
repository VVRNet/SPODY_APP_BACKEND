import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame } from '../../db/game'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'

const reqQuery = Type.Object({
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  game: Type.Array(
    Type.Object({
      id: Type.String({
        description: '게임 id',
      }),
      hostName: Type.String({
        description: '게임 host 이름',
      }),
      hostNameOrg: Type.Optional(
        Type.String({
          description: '게임 host가 기관일경우, 기관이름',
        }),
      ),
      players: Type.Number({
        description: '게임 참여자 수',
      }),
    }),
    { description: '참여가능한 게임 리스트' },
  ),
})
type resBodyType = Static<typeof resBody>

export const ApiGameGetList: RegisterApi = (
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
      tags: ['게임'],
      summary: '참여가능한 게임 확인',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
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

      // 현재 참여 정보 확인
      let listWaitingGame: WithId<SchemaGame>[]
      try {
        listWaitingGame = await CollGame.find({
          members: {
            $not: {
              $elemMatch: { status: 'play' },
            },
          },
        }).toArray()
      } catch (e) {
        throw new ExError('fail to find game for users', {
          type: 'int',
          code: 'DB_FIND_GAME',
          err: e,
        })
      }

      // API 응답
      reply.send({
        game: listWaitingGame.map((g) => ({
          id: g._id.toHexString(),
          hostName: g.host.name,
          hostNameOrg: g.host.orgName,
          players: g.members.length,
        })),
      })
    },
  })
}
