import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { WithId } from 'mongodb'
import WebSocket from 'ws'
import { CtxUserId, CtxUserType, StrToObjectId } from '../api/common'
import { GameDbToEvent, GameGetAllGameMemebers } from '../api/game/_service'
import { CollGame, SchemaGame, SchemaGameMember } from '../db/game'
import { CollHistory, SchemaHistory } from '../db/history'
import { CollHistoryVs, SchemaHistoryVs } from '../db/historyVs'
import { CollQuizReport } from '../db/quizReport'
import { ExError } from '../util/error'
import { SlackSendServerError } from '../util/slack'
import {
  WebsocketAuth,
  WebsocketBroadcast,
  WebsocketDisconnUserDel,
  WebsocketEventGameDone,
  WebsocketEventGameDoneMember,
  WebsocketMapAdd,
  WebsocketMapRemove,
} from './_service'

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

export const WebsocketGameRejoin = (app: FastifyInstance, path: string): void => {
  app.get<{ Querystring: reqQueryType }>(
    path,
    {
      websocket: true,
      schema: {
        tags: ['게임'],
        summary: '[웹소켓] 게임 재참여 - 웹소켓 클라이언트로 테스트하세요!',
        description: `연결이 끊겼던 게임에 재참여`,
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
      const condUserId =
        userType === 'class' && classId != null ? StrToObjectId(classId, 'CLASS') : userId

      // 현재 참여 정보 확인
      let gameInfo: WithId<SchemaGame> | null = null
      try {
        gameInfo = await CollGame.findOne({
          _id: StrToObjectId(req.query.gameId, 'GAME'),
        })
      } catch (e) {
        const exError = new ExError('fail to find game for users', {
          type: 'int',
          code: 'DB_FIND_GAME',
          err: e,
        })
        await SlackSendServerError(exError)
        connection.socket.send('ERR_INT_GAME_DB')
        connection.end()
        throw exError
      }

      if (gameInfo == null) {
        connection.socket.send('ERR_EXT_GAME_FINISHED')
        connection.end()
        return
      }

      if (
        (!gameInfo.host.id.equals(condUserId) || gameInfo.host.type !== userType) &&
        gameInfo.members.findIndex((m) => m.id.equals(condUserId) && m.type === userType) < 0
      ) {
        connection.socket.send('ERR_EXT_ALREADY_KICK')
        connection.end()
        return
      }

      // 연결끊긴 유저 목록에서 삭제
      await WebsocketDisconnUserDel(condUserId, userType, gameInfo._id)

      // 게임정보 주기
      connection.socket.send(JSON.stringify(GameDbToEvent('memberJoin', gameInfo)))

      // 게임 결과정보 주기
      let histories: WithId<SchemaHistory>[]
      try {
        histories = await CollHistory.find({
          gameId: gameInfo._id,
          gameCount: gameInfo.count,
        }).toArray()
      } catch (e) {
        throw new ExError('fail to find history for game', {
          type: 'int',
          code: 'DB_FIND_HISTORY',
          err: e,
        })
      }

      let vsHistories: WithId<SchemaHistoryVs>[] | null = null
      try {
        vsHistories = await CollHistoryVs.find({
          lastGameId: gameInfo._id,
        }).toArray()
      } catch (e) {
        throw new ExError('fail to get historyVs', {
          type: 'int',
          code: 'DB_GET_HISTORYVS',
          err: e,
        })
      }

      const gameReports = await CollQuizReport.find({
        gameId: gameInfo._id,
        gameCount: gameInfo.count,
      }).toArray()

      const resultsForMember = (
        await Promise.all(
          GameGetAllGameMemebers(gameInfo).map(async (n) => {
            const currentInfo: Omit<SchemaGameMember, 'status'> | undefined =
              gameInfo?.members.find((o) => o.id.equals(n.id) && o.type === n.type) ??
              (gameInfo?.host.id.equals(n.id) && gameInfo?.host.type === n.type
                ? gameInfo?.host
                : undefined)
            if (currentInfo == null) {
              return null
            }
            const currentHistory = histories.find(
              (h) => h.userId.equals(n.id) && h.userType === n.type,
            )
            const eventMember: WebsocketEventGameDoneMember = {
              userId: currentInfo.id.toHexString(), // 학생/반 id
              userType: currentInfo.type, // 방장유저 종류 (학생/반)
              name: currentInfo.name, // 참가자 이름
              orgName: currentInfo.orgName, // 참가자가 반일경우, 기관이름
              imgUrl: currentInfo.imgUrl, // 프로필 이미지 url
              country: currentInfo.country, // 국가
            }
            if (currentHistory == null) {
              return eventMember
            }

            const vsHistory =
              n.id === condUserId.toHexString() && n.type === userType
                ? undefined
                : vsHistories?.find(
                    (vh) =>
                      ((vh.from.id.equals(condUserId) && vh.from.type === userType) ||
                        (vh.from.id.equals(n.id) && vh.from.type === n.type)) &&
                      ((vh.to.id.equals(condUserId) && vh.to.type === userType) ||
                        (vh.to.id.equals(n.id) && vh.to.type === n.type)),
                  )

            eventMember.rank = currentHistory.rank ?? undefined // 게임 등수
            eventMember.answerOrder = currentHistory.answerOrder // 출제 문제 순서
            eventMember.answerCorrect = currentHistory.answerCorrect // 정답/오답 여부
            eventMember.ageLearn = currentHistory.ageLearn // 출제 문제 순서
            eventMember.ageCognative = currentHistory.ageCognative // 출제 문제 순서
            eventMember.ageActivity = currentHistory.ageActivity // 출제 문제 순서
            eventMember.vs =
              vsHistory == null
                ? { win: 0, all: 0 }
                : {
                    win:
                      vsHistory.from.id.equals(condUserId) && vsHistory.from.type === userType
                        ? vsHistory.win
                        : vsHistory.all - vsHistory.win,
                    all: vsHistory.all,
                  }
            eventMember.report = gameReports.filter(
              (r) => r.userId.equals(currentInfo.id) && r.userType === currentInfo.type,
            )
            return eventMember
          }),
        )
      ).filter((n): n is WebsocketEventGameDoneMember => n != null)

      const eventData: WebsocketEventGameDone = {
        gameId: gameInfo._id.toHexString(),
        gameCount: gameInfo.count,
        event: 'gameDone',
        quizId: gameInfo.quizId?.toHexString() ?? '',
        result: resultsForMember,
      }
      await WebsocketBroadcast([{ id: userId.toHexString(), type: userType }], eventData)

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
        condUserId.toHexString(),
        userType,
        gameInfo._id.toHexString(),
        connection.socket,
      )
    },
  )
}
