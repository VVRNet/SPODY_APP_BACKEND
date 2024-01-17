import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { InsertOneResult, ObjectId } from 'mongodb'
import WebSocket from 'ws'
import { CtxUserId, CtxUserType, StrToObjectId } from '../api/common'
import { UserGetFromID } from '../api/user/_service'
import { CollClass, SchemaClass } from '../db/class'
import { CollGame, SchemaGame, SchemaGameMember } from '../db/game'
import { SchemaUser } from '../db/user'
import { AgoraGetTokenWithNewChannel } from '../util/agoraToken'
import { ExError } from '../util/error'
import { SlackSendServerError } from '../util/slack'
import { WebsocketAuth, WebsocketMapAdd, WebsocketMapRemove } from './_service'

const reqQuery = Type.Object({
  token: Type.String({
    description: 'jwt access token - 웹소켓은 헤더를 지원하지않아 쿼리스트링으로 대체',
    minLength: 1,
  }),
  quizId: Type.String({
    description: '게임의 퀴즈 id',
    minLength: 1,
  }),
  hostRole: Type.Enum<{ play: 'play'; watch: 'watch' }>(
    {
      play: 'play',
      watch: 'watch',
    },
    { description: '게임 방장의 게임중 행동 - play(참여),watch(관전)', examples: ['play'] },
  ),
  members: Type.Optional(
    Type.String({
      description:
        '참여 유저들의 목록. id 뒤에 "/"로 학생과 반 여부를 뒤에 달고, "_"로 유저 리스팅. 예제 참고',
      examples: ['a3df34fd/std_vrd42h4xv/class'],
    }),
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 참여하고 싶은 반의 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

export const WebsocketGameCreate = (app: FastifyInstance, path: string): void => {
  app.get<{ Querystring: reqQueryType }>(
    path,
    {
      websocket: true,
      schema: {
        tags: ['게임'],
        summary: '[웹소켓] 게임 생성 - 웹소켓 클라이언트로 테스트하세요!',
        description: `게임생성 및 웹소켓 오픈. 검증 실패 및 오류 발생 시 연결 끊김`,
        querystring: reqQuery,
      },
      preHandler: async (request, reply) => {
        // 가입 인증
        await WebsocketAuth(request, reply)
      },
    },
    async (connection /* SocketStream */, req /* FastifyRequest */) => {
      const userId = CtxUserId(req)
      const userType = CtxUserType(req)
      const classId = req.requestContext.get('classId')
      const className = req.requestContext.get('className')

      // 참여멤버 파라미터 검증
      let members: {
        id: ObjectId
        type: 'std' | 'class'
        // status: 'inviting'
      }[]
      try {
        members =
          req.query.members == null
            ? []
            : req.query.members.split('_').map((m) => {
                const memberInfoRaw = m.split('/')
                const memberId = memberInfoRaw[0]
                const memberType = memberInfoRaw[1]
                if (!['std', 'class'].includes(memberType)) {
                  throw new Error()
                }
                return {
                  id: StrToObjectId(memberId, 'USER'),
                  type: memberType as 'std' | 'class',
                  // status: 'inviting',
                }
              })
      } catch (e: any) {
        connection.socket.send('ERR')
        connection.end()
        await SlackSendServerError(
          new ExError('wrong cond', {
            type: 'int',
            code: 'WEBSOCKET_COND',
            err: e,
            info: { members: JSON.stringify(req.query.members) },
          }),
        )
        return
      }

      if ((req.query.hostRole === 'play' ? 1 : 0) + members.length > 4) {
        connection.socket.send('GAME_FULL')
        connection.end()
        return
      }

      // 유저 검색
      const userInfo = await UserGetFromID(userId)
      if (userInfo == null) {
        connection.end()
        await SlackSendServerError(
          new ExError('user type is wrong', { type: 'int', code: 'WEBSOCKET_COND' }),
        )
        return
      }

      // 멤버별 정보 추출
      let membersInfo: SchemaGameMember[]
      try {
        membersInfo = await Promise.all(
          members.map(async (m): Promise<SchemaGameMember> => {
            let name: string
            let orgName: string | undefined = undefined
            let memberUserInfo: SchemaUser | null
            if (m.type === 'std') {
              memberUserInfo = await UserGetFromID(m.id)
              name = memberUserInfo?.name ?? ''
            } else {
              if (classId == null) {
                throw 'nope'
              }
              type typeClassWithUser = SchemaClass & { users: SchemaUser[] }
              const classWithUser = await CollClass.aggregate<typeClassWithUser>([
                { $match: { _id: classId } },
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
                {
                  throw 'nope'
                }
              }
              name = classWithUser[0].name ?? ''
              orgName = classWithUser[0].users[0].name ?? ''
              memberUserInfo = classWithUser[0].users[0]
            }

            return {
              id: m.id,
              type: m.type,
              name: name,
              orgName: orgName,
              imgUrl: memberUserInfo?.imgUrl,
              country: memberUserInfo?.imgUrl,
              status: 'inviting' as const,
            }
          }),
        )
      } catch (e) {
        connection.end()
        await SlackSendServerError(
          new ExError('wrong cond', { type: 'int', code: 'WEBSOCKET_DB_GETMEMBER', err: e }),
        )
        return
      }
      const agoraInfo = AgoraGetTokenWithNewChannel(userId.toHexString())
      // 방 생성
      const hostId =
        userType === 'org' && classId != null ? StrToObjectId(classId, 'CLASS') : userId
      const hostType = userType === 'org' ? 'class' : 'std'
      let gameInfo: InsertOneResult<SchemaGame> | null = null
      try {
        gameInfo = await CollGame.insertOne({
          host: {
            id: hostId,
            type: hostType,
            name: userType === 'org' ? className ?? '' : userInfo.name ?? '',
            orgName: userType === 'org' ? userInfo.name ?? '' : undefined,
            imgUrl: userInfo.imgUrl,
            country: userInfo.country,
            role: req.query.hostRole,
            playing: false,
          },
          members: membersInfo,
          quizId: StrToObjectId(req.query.quizId, 'QUIZ'),
          agoraChannel: agoraInfo.channelName,
          count: 0,
        })
      } catch (e) {
        connection.end()
        await SlackSendServerError(
          new ExError('db insert', { type: 'int', code: 'WEBSOCKET_GAME_INSERT', err: e }),
        )
        return
      }
      if (gameInfo == null) {
        connection.end()
        await SlackSendServerError(
          new ExError('db insert', { type: 'int', code: 'WEBSOCKET_GAME_INSERT' }),
        )
        return
      }

      const gameId = gameInfo.insertedId.toHexString()
      connection.socket.send(gameId)
      connection.socket.send(
        JSON.stringify({
          gameId: gameId,
          agoraChannel: agoraInfo.channelName,
          agoraToken: agoraInfo.token,
        }),
      )
      connection.socket.on('message', (message: any) => {
        connection.socket.send('_')
      })
      connection.socket.onclose = async (e: WebSocket.CloseEvent) => {
        await WebsocketMapRemove(e.target, true)
      }

      // 웹소켓 맵에 추가
      WebsocketMapAdd(hostId.toHexString(), hostType, gameId, connection.socket)
    },
  )
}
