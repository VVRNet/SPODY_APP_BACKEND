import { FastifyReply, FastifyRequest } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import WebSocket from 'ws'
import { ClassCheckAvailable } from '../api/class/_service'
import { StrToObjectId } from '../api/common'
import { SchemaClass } from '../db/class'
import { CollDisconnUser } from '../db/disconnUser'
import { SchemaGameHost, SchemaGameMember } from '../db/game'
import { ExError } from '../util/error'
import { IpManagerClusterIps } from '../util/ipManager'
import { JwtAccessVerify } from '../util/jwt'
import { SlackSendServerError } from '../util/slack'

export type WebsocketEventType =
  | 'memberInvited'
  | 'memberJoin'
  | 'memberLeave'
  | 'hostChanged'
  | 'quizUpdated'
  | 'memberReady'
  | 'memberUnready'
  | 'gameStart'
  | 'gameClosed'

export type WebsocketEvent = {
  gameId: string
  event: WebsocketEventType
  host: Omit<SchemaGameHost, 'id'> & { id: string }
  members: (Omit<SchemaGameMember, 'id'> & { id: string })[]
  quizId?: string
  agoraChannel: string
  agoraToken?: string
}

export type WebsocketEventGameDoneMember = {
  userId: string // 학생/반 id
  userType: 'std' | 'class' // 방장유저 종류 (학생/반)
  name: string // 참가자 이름
  orgName?: string // 참가자가 반일경우, 기관이름
  imgUrl?: string // 프로필 이미지 url
  country?: string // 국가
  rank?: number // 게임 등수
  answerOrder?: number[] // 출제 문제 순서
  answerCorrect?: boolean[] // 정답/오답 여부
  ageLearn?: number // 학습능력 나이
  ageCognative?: number // 인지능력 나이
  ageActivity?: number // 운동능력 나이
  vs?: {
    // 수신유저와의 전적
    win: number
    all: number
  }
  report?: {
    // 문제 피드백 내역
    pos: number
    content: string
  }[]
}

export type WebsocketEventGameDone = {
  gameId: string
  event: 'gameDone'
  quizId: string
  gameCount: number
  result: WebsocketEventGameDoneMember[]
}

export let WebsocketMap: {
  userId: string
  userType: 'std' | 'class'
  gameId: string
  conn: WebSocket
}[] = []

export const WebsocketAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string; userType: string } | undefined> => {
  const jwt = (request.query as Record<string, any>).token
  const classId = (request.query as Record<string, any>).classId
  if (jwt == null) {
    await reply.code(401).send('not authenticated')
    return
  }
  const jwtPayload = await JwtAccessVerify(jwt)
  let classInfo: WithId<SchemaClass> | null = null
  try {
    classInfo = await ClassCheckAvailable(
      jwtPayload.type,
      StrToObjectId(jwtPayload.userId, 'USER'),
      classId == null ? classId : StrToObjectId(classId, 'CLASS'),
    )
  } catch (e) {
    await reply.code(401).send('not authenticated')
    return
  }
  const userId = jwtPayload.userId
  request.requestContext.set('userId', userId)
  request.requestContext.set('userType', jwtPayload.type)
  if (classId != null && classInfo != null) {
    request.requestContext.set('classId', classId)
    request.requestContext.set('className', classInfo.name)
  }
  return {
    userId: userId,
    userType: jwtPayload.type,
  }
}

export const WebsocketMapAdd = async (
  userId: string,
  userType: 'std' | 'class',
  gameId: string,
  conn: WebSocket,
) => {
  WebsocketMap.push({
    userId: userId,
    userType: userType,
    gameId: gameId,
    conn: conn,
  })
  console.log(
    WebsocketMap.map((w) => ({ t: 'checkWebsocket', e: 'add', id: w.userId, type: w.userType })),
  )
}
export const WebsocketMapRemoveWithUser = async (
  userId: string,
  userType: 'std' | 'class',
  otherServer = true,
) => {
  const connection = WebsocketMap.find((w) => w.userId === userId && w.userType === userType)?.conn
  if (connection != null) {
    await WebsocketMapRemove(connection, false)
    return
  }

  if (otherServer) {
    await Promise.all(
      IpManagerClusterIps().map(async (ip) => {
        const requestUrl = `http://${ip}:8080/game/broadcast/leave`
        try {
          await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              userType: userType,
            }),
          })
        } catch (e) {
          await SlackSendServerError(
            new ExError('failed to broadcast', {
              type: 'int',
              code: 'WS_BRODCAST_ERROR',
              info: { requestUrl: requestUrl },
              err: e,
            }),
          )
        }
        return null
      }),
    )
  }
}

// 웹소켓맵에서 삭제
export const WebsocketMapRemove = async (connection: WebSocket, suddenly: boolean) => {
  const websocketInfo = WebsocketMap.find((w) => w.conn === connection)
  if (websocketInfo == null) {
    return
  }
  WebsocketMap = WebsocketMap.filter((w) => w === websocketInfo)
  if (suddenly) {
    await CollDisconnUser.insertOne({
      userId: StrToObjectId(websocketInfo.userId, 'USER'),
      userType: websocketInfo.userType,
      gameId: StrToObjectId(websocketInfo.gameId, 'GAME'),
      disconnAt: new Date(),
    })
  }
  try {
    connection.close()
  } catch (e) {
    console.log(e)
  }
}

export const WebsocketBroadcast = async (
  members: { id: string; type: 'std' | 'class' }[],
  eventData: WebsocketEvent | WebsocketEventGameDone | string,
  otherServer = true,
) => {
  console.log('broadcast')
  const message = typeof eventData === 'string' ? eventData : JSON.stringify(eventData)
  console.log(`members (${members.length}): ${JSON.stringify(members)}`)
  const targetMembers = WebsocketMap.filter(
    (w) => members.filter((m) => w.userId === m.id && w.userType === m.type).length > 0,
  )
  console.log(
    `targetMembers (${targetMembers.length}): ${JSON.stringify(
      targetMembers.map((t) => ({ id: t.userId, type: t.userType })),
    )}`,
  )
  if (targetMembers.length > 0) {
    for (const t of targetMembers) {
      console.log(`${t.userId} / ${t.userType}`)
      t.conn.send(message)
    }
  }

  if (otherServer) {
    // const restMembers = members.filter((r)=>())
    await Promise.all(
      IpManagerClusterIps().map(async (ip) => {
        const requestUrl = `http://${ip}:8080/game/broadcast`
        try {
          await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              users: members,
              message: message,
            }),
          })
        } catch (e) {
          await SlackSendServerError(
            new ExError('failed to broadcast', {
              type: 'int',
              code: 'WS_BRODCAST_ERROR',
              info: { requestUrl: requestUrl },
              err: e,
            }),
          )
        }
        return null
      }),
    )
  }
}

export const WebsocketDisconnUserDel = async (
  userId: ObjectId,
  userType: 'std' | 'class',
  gameId: ObjectId,
) => {
  try {
    await CollDisconnUser.deleteMany({
      userId: userId,
      userType: userType,
      gameId: gameId,
    })
  } catch (e) {
    throw new ExError('fail to delete disconnUser Data', {
      type: 'int',
      code: 'DB_DISCONNUSER_DELETE',
    })
  }
}
