import { Static, Type } from '@fastify/type-provider-typebox'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame } from '../../db/game'
import { ExError } from '../../util/error'
import { WebsocketEvent, WebsocketEventType } from '../../websocket/_service'

export const GameGetFromID = async (id: ObjectId) => {
  try {
    return await CollGame.findOne({
      _id: id,
    })
  } catch (e) {
    throw new ExError('fail to get game', {
      type: 'int',
      code: 'DB_GET_GAME',
      err: e,
    })
  }
}

export const GameGetAllGameMemebers = (game: SchemaGame) => {
  return [
    { id: game.host.id.toHexString(), type: game.host.type },
    ...game.members.map((m) => ({ id: m.id.toHexString(), type: m.type })),
  ]
}

export const GameGetOtherGameMemebers = (
  game: SchemaGame,
  userId: ObjectId,
  userType: 'std' | 'class',
) => {
  const otherMembers = game.members
    .filter((m) => !m.id.equals(userId) || m.type !== userType)
    .map((m) => ({ id: m.id.toHexString(), type: m.type }))
  if (!game.host.id.equals(userId) || game.host.type !== userType) {
    otherMembers.push({ id: game.host.id.toHexString(), type: game.host.type })
  }
  return otherMembers
}

export const GameGetMemberType = (
  gameInfo: WithId<SchemaGame> | null,
  userId: ObjectId,
  userType: 'std' | 'class',
) => {
  if (gameInfo == null) {
    return null
  }
  if (gameInfo.host.id.equals(userId) && gameInfo.host.type === userType) {
    return 'host'
  }
  if (gameInfo.members.some((m) => m.id.equals(userId) && m.type === userType)) {
    return 'member'
  }
  return null
}

export const ResGameInfo = Type.Object({
  gameId: Type.String({ description: '게임 id' }),
  event: Type.String({ description: '이벤트 종류' }),
  host: Type.Object({
    id: Type.String({ description: 'id' }),
    type: Type.Enum<{ std: 'std'; class: 'class' }>(
      {
        std: 'std',
        class: 'class',
      },
      { description: '학생/반 여부 - std(학생),class(반)', examples: ['std'] },
    ),
    name: Type.String({ description: '이름' }),
    orgName: Type.Optional(Type.String({ description: '반일경우, 기관의 이름' })),
    role: Type.Enum<{ play: 'play'; watch: 'watch' }>(
      { play: 'play', watch: 'watch' },
      { description: '게임 host의 게임중 역할', examples: ['play'] },
    ),
  }),
  members: Type.Array(
    Type.Object({
      id: Type.String({ description: 'id' }),
      type: Type.Enum<{ std: 'std'; class: 'class' }>(
        {
          std: 'std',
          class: 'class',
        },
        { description: '학생/반 여부 - std(학생),class(반)', examples: ['std'] },
      ),
      name: Type.String({ description: '이름' }),
      orgName: Type.Optional(Type.String({ description: '반일경우, 기관의 이름' })),
      status: Type.Enum<{
        inviting: 'inviting'
        join: 'join'
        ready: 'ready'
        play: 'play'
      }>(
        {
          inviting: 'inviting',
          join: 'join',
          ready: 'ready',
          play: 'play',
        },
        { description: '현재 상태', examples: ['inviting'] },
      ),
    }),
  ),
  quizId: Type.Optional(Type.String({ description: '퀴즈 id' })),
})
export type ResGameInfoType = Static<typeof ResGameInfo>
export const GameDbToEvent = (eventName: WebsocketEventType, gameInfo: SchemaGame): WebsocketEvent => ({
  gameId: gameInfo._id?.toHexString() ?? '',
  quizId: gameInfo.quizId?.toHexString(),
  event: eventName,
  agoraChannel: gameInfo.agoraChannel,
  host: {
    orgName: gameInfo.host.orgName,
    id: gameInfo.host.id.toHexString(),
    type: gameInfo.host.type,
    name: gameInfo.host.name,
    role: gameInfo.host.role,
    imgUrl: gameInfo.host.imgUrl,
    country: gameInfo.host.country,
    playing: gameInfo.host.playing,
  },
  members: gameInfo.members.map((m) => ({
    orgName: m.orgName,
    status: m.status,
    id: m.id.toHexString(),
    type: m.type,
    name: m.name,
    imgUrl: m.imgUrl,
    country: m.country,
  })),
})
