import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame } from '../../db/game'
import { ExError } from '../../util/error'
import {
  WebsocketBroadcast,
  WebsocketDisconnUserDel,
  WebsocketMapRemoveWithUser,
} from '../../websocket/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable, ClassGetFromID } from '../class/_service'
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
    description: '내보낼 학생/반의 id',
    minLength: 1,
  }),
  userType: Type.Enum<{ std: 'std'; class: 'class' }>(
    {
      std: 'std',
      class: 'class',
    },
    { description: '내보낼 대상의 학생/반 여부 - std(학생),class(반)', examples: ['std'] },
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiGameKick: RegisterApi = (
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
      summary:
        '게임 내보내기. 게임 host만 가능. 추가-게임의 참여중인 멤버가 자신의 id로 memberLeave이벤트를 받으면 순순히 웹소켓끊고 나가야함',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
      . GAME_NOTFOUND : 해당 게임이 존재하지 않거나 host가 아님
      . GAME_ALREADY_KICKED : 해당 게임에 존지해지 않은 멤버
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
        !gameInfo.members.some(
          (m) => m.id.toHexString() === request.body.userId && m.type === request.body.userType,
        )
      ) {
        throw new ExError('game not member', {
          type: 'ext',
          code: 'GAME_ALREADY_KICKED',
        })
      }

      // 대상 유저/class 존재여부 확인
      let targetId: ObjectId | undefined = undefined
      const targetType = request.body.userType
      if (targetType === 'std') {
        targetId = (await UserGetFromID(StrToObjectId(request.body.userId, 'USER')))?._id
      } else {
        targetId = (await ClassGetFromID(StrToObjectId(request.body.userId, 'CLASS')))?._id
      }
      if (targetId == null) {
        throw new ExError('invited member not existed', {
          type: 'ext',
          code: `${targetType === 'std' ? 'USER' : 'CLASS'}_NOTFOUND`,
        })
      }

      // 방 정보 업데이트
      let result: WithId<SchemaGame> | null = null
      try {
        result = await CollGame.findOneAndUpdate(
          {
            _id: gameId,
          },
          {
            $pull: { members: { id: targetId, type: targetType } },
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

      // 연결끊긴 유저 목록에서 삭제
      await WebsocketDisconnUserDel(targetId, targetType, gameInfo._id)

      const eventData = GameDbToEvent('memberLeave', result)
      // 이벤트 전파
      await WebsocketBroadcast(GameGetAllGameMemebers(gameInfo), eventData)
      await WebsocketMapRemoveWithUser(targetId.toHexString(), targetType)
      // API 응답
      reply.send(eventData)
    },
  })
}
