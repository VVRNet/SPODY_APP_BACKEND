import { WithId } from 'mongodb'
import {
  GameDbToEvent,
  GameGetAllGameMemebers,
  GameGetFromID,
  GameGetMemberType,
} from '../api/game/_service'
import { CollDisconnUser, SchemaDisconnUser } from '../db/disconnUser'
import { CollGame, SchemaGame } from '../db/game'
import { Env } from '../util/env'
import { ExError } from '../util/error'
import { SlackSendServerError } from '../util/slack'
import { WebsocketBroadcast } from './_service'

const deleteThresholdMin = 1

export const DisconnManagerStart = async () => {
  while (true) {
    await removeDiconn()
    await new Promise((f) => setTimeout(f, 15000))
  }
}

const removeDiconn = async () => {
  let deleteTargets: WithId<SchemaDisconnUser>[] | undefined
  try {
    deleteTargets = await CollDisconnUser.find({
      disconnAt: { $lte: new Date(new Date().getTime() - 60000 * deleteThresholdMin) },
    }).toArray()
  } catch (error) {
    const exErr = new ExError('fail find', {
      type: 'int',
      code: 'DISCONNAMNAGER_FIND_FAILED',
    })
    if (Env().env !== 'local') {
      await SlackSendServerError(exErr)
    } else {
      console.log(exErr)
    }
  }

  console.log(`disconnTarget : ${JSON.stringify(deleteTargets)}`)

  if (deleteTargets == null || deleteTargets.length < 1) {
    return
  }

  // 각 게임에서 나가기처리
  await Promise.all(
    deleteTargets.map(async (t) => {
      const gameInfo = await GameGetFromID(t._id)
      const gameMemberType = GameGetMemberType(gameInfo, t.userId, t.userType)
      if (gameInfo == null || gameMemberType == null) {
        return
      }
      const nextHostPos = gameInfo.members.findIndex((m) => m.status !== 'inviting')
      const needCloseGame = gameMemberType === 'host' && nextHostPos < 0
      if (needCloseGame) {
        // 게임 삭제
        try {
          await CollGame.deleteOne({
            _id: t.gameId,
          })
        } catch (e) {
          throw new ExError('failed to delete game', {
            type: 'int',
            code: 'DB_DELETE_GAME',
            err: e,
            info: {
              gameId: t.gameId.toHexString(),
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
              _id: t.gameId,
            },
            gameMemberType === 'member'
              ? {
                  $pull: { members: { id: t.userId, type: t.userType } },
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
      }
    }),
  )

  // disConn DB 에서 삭제
  try {
    await CollDisconnUser.deleteMany({
      _id: { $in: deleteTargets.map((t) => t._id) },
    })
  } catch (error) {
    const exErr = new ExError('fail delete', {
      type: 'int',
      code: 'DISCONNAMNAGER_DELETE_FAILED',
    })
    if (Env().env !== 'local') {
      await SlackSendServerError(exErr)
    } else {
      console.log(exErr)
    }
  }
}
