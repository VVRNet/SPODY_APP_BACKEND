import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame } from '../../db/game'
import { ExError } from '../../util/error'
import { WebsocketBroadcast, WebsocketMapRemoveWithUser } from '../../websocket/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'
import { GameDbToEvent, GameGetAllGameMemebers, GameGetFromID, GameGetMemberType } from './_service'

const reqBody = Type.Object({
  gameId: Type.String({
    description: '떠나고자 하는 방 id',
    minLength: 1,
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiGameLeave: RegisterApi = (
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
      tags: ['게임'],
      summary: '게임 떠나고 웹소켓 연결 종료. host였을 경우 멤버중 1인이 host가 됨',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
      . GAME_NOTFOUND : 해당 게임이 존재하지 않거나 참여하지 않은 방임
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (request.body.classId != null) {
        classId = StrToObjectId(request.body.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)
      const condUserId = userType === 'org' && classId != null ? classId : userId
      const condUserType = userType === 'org' ? 'class' : 'std'

      // 현재 참여 정보 확인
      const gameId = StrToObjectId(request.body.gameId, 'GAME')
      const gameInfo = await GameGetFromID(gameId)
      const gameMemberType = GameGetMemberType(gameInfo, condUserId, condUserType)

      if (gameInfo == null || gameMemberType == null) {
        throw new ExError('game not existed', {
          type: 'ext',
          code: 'GAME_NOTFOUND',
        })
      }

      const nextHostPos = gameInfo.members.findIndex((m) => m.status !== 'inviting')
      const needCloseGame = gameMemberType === 'host' && nextHostPos < 0
      if (needCloseGame) {
        // 게임 삭제
        try {
          await CollGame.deleteOne({
            id: gameId,
          })
        } catch (e) {
          throw new ExError('failed to delete game', {
            type: 'int',
            code: 'DB_DELETE_GAME',
            err: e,
            info: {
              gameId: gameId.toHexString(),
            },
          })
        }
      } else {
        // 게임 정보 업데이트
        const nextHost = gameInfo.members[nextHostPos]
        let result: WithId<SchemaGame> | null = null
        try {
          result = await CollGame.findOneAndUpdate(
            {
              _id: gameId,
            },
            gameMemberType === 'member'
              ? {
                  $pull: { members: { id: condUserId, type: condUserType } },
                }
              : {
                  $set: {
                    host: {
                      id: nextHost.id,
                      type: nextHost.type,
                      name: nextHost.name,
                      orgName: nextHost.orgName,
                      imgUrl: nextHost.imgUrl,
                      country: nextHost.country,
                      role: gameInfo.host.role,
                      playing: nextHost.status === 'play',
                    },
                  },
                  $pull: {
                    members: { id: nextHost.id, type: nextHost.type },
                  },
                },
            { returnDocument: 'after' },
          )
        } catch (e) {
          throw new ExError('fail to update game', {
            type: 'int',
            code: 'DB_UPDATE_GAME',
            err: e,
          })
        }
        if (result == null) {
          throw new ExError('fail to update game', {
            type: 'int',
            code: 'DB_UPDATE_GAME',
          })
        }
        const eventData = GameDbToEvent(
          gameMemberType === 'host' ? 'hostChanged' : 'memberLeave',
          result,
        )
        // 이벤트 전파
        await WebsocketBroadcast(GameGetAllGameMemebers(gameInfo), eventData)
        await WebsocketMapRemoveWithUser(condUserId.toHexString(), condUserType)
      }
      // API 응답
      reply.send(ResOkValue)
    },
  })
}
