import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame } from '../../db/game'
import { ExError } from '../../util/error'
import { WebsocketBroadcast } from '../../websocket/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { QuizGetFromId } from '../quiz/_service'
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
  quizId: Type.String({
    description: '변경할 퀴즈의 id',
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

export const ApiGameUpdateQuiz: RegisterApi = (
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
      summary: '게임 내 퀴즈변경',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
      . GAME_NOTFOUND : 해당 게임이 존재하지 않거나 host가 아닌 게임임
      . GAME_ALREADY_INVITED : 해당 게임에 이미 초대되어 있음
      . QUIZ_NOTFOUND : 대상 퀴즈를 찾지못함
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

      // 대상 퀴즈 존재여부 확인
      const quizInfo = await QuizGetFromId(StrToObjectId(request.body.quizId, 'QUIZ'))
      if (quizInfo == null) {
        throw new ExError('quiz not existed', {
          type: 'ext',
          code: 'QUIZ_NOTFOUND',
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
            $set: { quizId: quizInfo._id },
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

      const eventData = GameDbToEvent('quizUpdated', result)
      // 이벤트 전파
      await WebsocketBroadcast(GameGetAllGameMemebers(gameInfo), eventData)
      // API 응답
      reply.send(eventData)
    },
  })
}
