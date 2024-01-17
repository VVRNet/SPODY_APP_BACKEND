import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollClass, SchemaClass } from '../../db/class'
import { CollGame, SchemaGame } from '../../db/game'
import { SchemaUser } from '../../db/user'
import { ExError } from '../../util/error'
import { WebsocketBroadcast } from '../../websocket/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { UserGetFromID } from '../user/_service'
import {
  GameDbToEvent,
  GameGetAllGameMemebers,
  GameGetFromID,
  GameGetMemberType,
  ResGameInfo,
  ResGameInfoType,
} from './_service'

const reqBody = Type.Object({
  gameId: Type.String({
    description: '참여중인 방 id',
    minLength: 1,
  }),
  userId: Type.String({
    description: '초대 대상 학생/반의 id',
    minLength: 1,
  }),
  userType: Type.Enum<{ std: 'std'; class: 'class' }>(
    {
      std: 'std',
      class: 'class',
    },
    { description: '초대 대상의 학생/반 여부 - std(학생),class(반)', examples: ['std'] },
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiGameInvite: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResGameInfoType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['게임'],
      summary: '게임 초대. 게임 host만 가능.',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
      . GAME_NOTFOUND : 해당 게임이 존재하지 않거나 host가 아닌 게임임
      . GAME_ALREADY_INVITED : 해당 게임에 이미 초대되어 있음
      . GAME_FULL : 게임인원이 이미 꽉찼음
      . USER_NOTFOUND : 초대대상을 찾지못함
      . CLASS_NOTFOUND : 초대대상을 찾지못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResGameInfo,
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

      if (gameInfo == null || gameMemberType !== 'host') {
        throw new ExError('game not existed', {
          type: 'ext',
          code: 'GAME_NOTFOUND',
        })
      }

      if (
        gameInfo.members.some(
          (m) => m.id.toHexString() === request.body.userId && m.type === request.body.userId,
        )
      ) {
        throw new ExError('game already invited', {
          type: 'ext',
          code: 'GAME_ALREADY_INVITED',
        })
      }

      if ((gameInfo.host.role === 'play' ? 1 : 0) + gameInfo.members.length > 4) {
        throw new ExError('game already full', {
          type: 'ext',
          code: 'GAME_FULL',
        })
      }

      // 대상 유저/class 존재여부 확인
      const targetId = StrToObjectId(request.body.userId, 'USER')
      const targetType = request.body.userType
      let name: string | undefined = undefined
      let orgName: string | undefined = undefined
      if (targetType === 'std') {
        name = (await UserGetFromID(targetId))?.name ?? ''
      } else {
        if (targetId != null) {
          throw new ExError('game not existed', {
            type: 'ext',
            code: 'CLASS_NOTFOUND',
          })
        }
        type typeClassWithUser = SchemaClass & { users: SchemaUser[] }
        const classWithUser = await CollClass.aggregate<typeClassWithUser>([
          { $match: { _id: targetId } },
          {
            $lookup: {
              from: 'user',
              localField: 'userId',
              foreignField: '_id',
              as: 'users',
            },
          },
        ]).toArray()
        if (classWithUser[0]?.users?.[0] == null) {
          throw new ExError('game not existed', {
            type: 'ext',
            code: 'CLASS_NOTFOUND',
          })
        }
        name = classWithUser[0].name ?? ''
        orgName = classWithUser[0].users[0].name ?? ''
      }

      // 방 정보 업데이트
      let result: WithId<SchemaGame> | null = null
      try {
        result = await CollGame.findOneAndUpdate(
          {
            _id: gameId,
          },
          {
            $push: {
              members: {
                id: targetId,
                type: targetType,
                name: name,
                orgName: orgName,
                status: 'inviting',
              },
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

      const eventData = GameDbToEvent('memberInvited', result)
      // 이벤트 전파
      await WebsocketBroadcast(GameGetAllGameMemebers(gameInfo), eventData)
      // API 응답
      reply.send(eventData)
    },
  })
}
