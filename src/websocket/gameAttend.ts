import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import WebSocket from 'ws'
import { ClassGetFromID } from '../api/class/_service'
import { CtxUserId, CtxUserType, StrToObjectId } from '../api/common'
import { GameDbToEvent, GameGetOtherGameMemebers } from '../api/game/_service'
import { UserGetFromID } from '../api/user/_service'
import { CollGame, SchemaGame, SchemaGameMember } from '../db/game'
import { AgoraGetToken } from '../util/agoraToken'
import { ExError } from '../util/error'
import { SlackSendServerError } from '../util/slack'
import { WebsocketAuth, WebsocketBroadcast, WebsocketMapAdd, WebsocketMapRemove } from './_service'

const reqQuery = Type.Object({
  token: Type.String({
    description: 'jwt access token - 웹소켓은 헤더를 지원하지않아 쿼리스트링으로 대체',
    minLength: 1,
  }),
  gameId: Type.String({
    description: '참여하고자 하는 방 id',
    minLength: 1,
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 참여하고 싶은 반의 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

export const WebsocketGameAttend = (app: FastifyInstance, path: string): void => {
  app.get<{ Querystring: reqQueryType }>(
    path,
    {
      websocket: true,
      schema: {
        tags: ['게임'],
        summary: '[웹소켓] 게임 참여(미초대) - 웹소켓 클라이언트로 테스트하세요!',
        description: `미초대 게임에 참여. 검증 실패 및 오류 발생 시 연결 끊김`,
        querystring: reqQuery,
      },
      preHandler: async (request, reply) => {
        // 유저 검증
        await WebsocketAuth(request, reply)
      },
    },
    async (connection /* SocketStream */, req /* FastifyRequest */) => {
      const userId = CtxUserId(req)
      const userType = CtxUserType(req) === 'org' ? 'class' : 'std'
      const classId = req.requestContext.get('classId')

      // 게임정보 확인
      let targetGame: WithId<SchemaGame> | null = null
      try {
        targetGame = await CollGame.findOne({
          id: StrToObjectId(req.query.gameId, 'GAME'),
        })
        if (targetGame == null) {
          throw new Error('')
        }
      } catch (e) {
        const exError = new ExError('fail to get game', {
          type: 'int',
          code: 'DB_GET_GAME',
          err: e,
        })
        await SlackSendServerError(exError)
        connection.socket.send('GAME_FINISHED')
        connection.end()
        throw exError
      }

      // 게임중인지 확인
      if (targetGame.host.playing || targetGame.members.some((m) => m.status === 'play')) {
        connection.socket.send('GAME_PLAYING')
        connection.end()
        return
      }

      // 방이 꽉차있는지 확인
      if ((targetGame.host.role === 'play' ? 1 : 0) + targetGame.members.length > 4) {
        connection.socket.send('GAME_FULL')
        connection.end()
        return
      }

      // 멤버 정보 추출
      const memberUserInfo = await UserGetFromID(userId)
      if (memberUserInfo == null) {
        connection.end()
        return
      }
      const memberClassInfo =
        classId == null ? undefined : await ClassGetFromID(StrToObjectId(classId, 'CLASS'))
      const memberId =
        userType === 'std' || memberClassInfo == null ? memberUserInfo._id : memberClassInfo._id
      const membersInfo: SchemaGameMember = {
        id: memberId,
        type: userType,
        name:
          (userType === 'std' || memberClassInfo == null
            ? memberUserInfo.name
            : memberClassInfo.name) ?? '',
        orgName: userType !== 'std' && memberClassInfo != null ? memberUserInfo.name : undefined,
        imgUrl: memberUserInfo.imgUrl,
        country: memberUserInfo.imgUrl,
        status: 'join' as const,
      }

      // 방 정보 업데이트
      let result: WithId<SchemaGame> | null = null
      try {
        result = await CollGame.findOneAndUpdate(
          {
            _id: targetGame._id,
          },
          {
            $addToSet: { members: membersInfo },
          },
          { returnDocument: 'after' },
        )
      } catch (e) {
        connection.end()
        return
      }
      if (result == null) {
        connection.end()
        return
      }

      const eventData = GameDbToEvent('memberJoin', result)

      // 이벤트 전파
      await WebsocketBroadcast(GameGetOtherGameMemebers(targetGame, memberId, userType), eventData)

      // 아고라 토큰 추가
      eventData.agoraToken = AgoraGetToken(userId.toHexString(), eventData.agoraChannel)

      // 게임정보 주기
      connection.socket.send(JSON.stringify(eventData))

      // 커넥션 관리
      connection.socket.on('message', (message: any) => {
        connection.socket.send('_')
      })
      connection.socket.onclose = async (e: WebSocket.CloseEvent) => {
        await WebsocketMapRemove(e.target, true)
        console.log('closed!')
      }

      // 웹소켓 맵에 추가
      WebsocketMapAdd(
        memberId.toHexString(),
        userType,
        targetGame._id.toHexString(),
        connection.socket,
      )
    },
  )
}
