import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollGame, SchemaGame, SchemaGameMember } from '../../db/game'
import { CollHistory, SchemaHistory } from '../../db/history'
import { CollHistoryVs, SchemaHistoryVs } from '../../db/historyVs'
import { CollQuiz } from '../../db/quiz'
import { CollQuizReport, SchemaQuizReport } from '../../db/quizReport'
import { CollSubject } from '../../db/subject'
import { ExError } from '../../util/error'
import {
  WebsocketBroadcast,
  WebsocketEventGameDone,
  WebsocketEventGameDoneMember,
} from '../../websocket/_service'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable, ClassGetFromID } from '../class/_service'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'
import { PointUpdate } from '../point/_service'
import { QuizGetFromId } from '../quiz/_service'
import { KeywordGetFromId, SubjectGetFromID } from '../subject/_service'
import {
  GameGetAllGameMemebers,
  GameGetFromID,
  GameGetMemberType,
  GameGetOtherGameMemebers,
} from './_service'

const reqBody = Type.Object({
  quizId: Type.String({
    description: '퀴즈 id',
    minLength: 1,
  }),
  keywordId: Type.String({
    description: '과목명 id',
    minLength: 1,
  }),
  gameId: Type.Optional(
    Type.String({
      description: '퀴즈 게임 id. 혼자하기일 경우 없음.',
      minLength: 1,
    }),
  ),
  subjectId: Type.Optional(
    Type.String({
      description: '과목 id',
      minLength: 1,
    }),
  ),
  answerOrder: Type.Array(Type.Number(), {
    description: '출제 문제 순서',
  }),
  answerTime: Type.Array(Type.Number(), {
    description: '답변 소요시간',
  }),
  answerCorrect: Type.Array(Type.Boolean(), {
    description: '정답 여부',
  }),
  ageLearn: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
  ageCognative: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
  ageActivity: Type.Number({
    description: '학습능력 나이',
    minimum: 1,
  }),
  report: Type.Optional(
    Type.Array(
      // TODO : 내부구현
      Type.Object({
        pos: Type.Number({
          description: '신고할 문제 번호 (1~10)',
          minimum: 1,
          maximum: 10,
        }),
        content: Type.String({
          description: '신고내용',
        }),
      }),
    ),
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiGamePostResult: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: WebsocketEventGameDone | ResOkType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['게임'],
      summary: '개인별 게임결과 레포트',
      description: `[ 200리턴 내용 ]
      
      . 혼자할때 : 단순 ok응답
      . 같이할때 : 게임완료 websocket 응답과 동일
      
      [ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 반을 찾지 못함
      . QUIZ_WRONG_ID : 잘못된 형식의 퀴즈 id
      . QUIZ_NOTFOUND : 퀴즈 찾지 못함
      . KEYWORD_WRONG_ID : 잘못된 형식의 과목명 id
      . KEYWORD_NOTFOUND : 과목명 찾지 못함
      . GAME_WRONG_ID : 잘못된 형식의 게임 id
      . GAME_NOTFOUND : 게임 찾지 못함
      . SUBJECT_WRONG_ID : 잘못된 형식의 과제 id
      . SUBJECT_NOTFOUND : 과제 찾지 못함
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      // response: {
      //   200: ResOk,
      // },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)
      // const userId = StrToObjectId('64affa4c136d2711a9b81942', 'USER')
      // const userType = 'std' as 'std' | 'org' | 'admin'

      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (request.body.classId != null) {
        classId = StrToObjectId(request.body.classId, 'CLASS')
      }

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(userType, userId, classId)

      // 존재하는 과목인지 확인
      const quizId = StrToObjectId(request.body.quizId, 'QUIZ')
      const keywordId = StrToObjectId(request.body.keywordId, 'KEYWORD')
      const gameId =
        request.body.gameId == null ? undefined : StrToObjectId(request.body.gameId, 'GAME')
      const subjectId =
        request.body.subjectId == null
          ? undefined
          : StrToObjectId(request.body.subjectId, 'SUBJECT')
      const quizInfo = await QuizGetFromId(quizId)
      if (quizInfo == null) {
        throw new ExError('quiz not existed', {
          type: 'ext',
          code: 'QUIZ_NOTFOUND',
        })
      }
      if ((await KeywordGetFromId(keywordId)) == null) {
        throw new ExError('keyword not existed', {
          type: 'ext',
          code: 'KEYWORD_NOTFOUND',
        })
      }
      let gameInfo: WithId<SchemaGame> | null = null
      if (gameId != null) {
        gameInfo = await GameGetFromID(gameId)
        if (gameInfo == null) {
          throw new ExError('game not existed', {
            type: 'ext',
            code: 'GAME_NOTFOUND',
          })
        }
      }

      // 문제풀이 횟수 업데이트
      const quizCountDelta: { correctCount: number; tryCount: number }[] = [...Array(10)].map(
        (_, i) => {
          const delta = {
            correctCount: 0,
            tryCount: 0,
          }
          for (let j = 0; j < request.body.answerOrder.length; j++) {
            if (request.body.answerOrder[j] === i) {
              delta.tryCount++
              if (request.body.answerCorrect[j]) {
                delta.correctCount++
              }
            }
          }
          return delta
        },
      )

      const quizUpdateDelta: Record<string, number> = { statCount: 1 }
      quizCountDelta.forEach((delta, index) => {
        if (delta.tryCount > 0) {
          quizUpdateDelta[`question.${index}.tryCount`] = delta.tryCount
        }
        if (delta.correctCount > 0) {
          quizUpdateDelta[`question.${index}.correctCount`] = delta.correctCount
        }
      })
      const getNewAvgAge = (newAge: number, curAvgAge?: number, curCount?: number) =>
        ((curAvgAge ?? 0) * (curCount ?? 0) + newAge) / ((curCount ?? 0) + 1)
      try {
        await CollQuiz.findOneAndUpdate(
          { _id: quizId },
          {
            $set: {
              statAvgAgeActivity: getNewAvgAge(
                request.body.ageActivity,
                quizInfo.statAvgAgeActivity,
                quizInfo.statCount,
              ),
              statAvgAgeCognative: getNewAvgAge(
                request.body.ageCognative,
                quizInfo.statAvgAgeCognative,
                quizInfo.statCount,
              ),
              statAvgAgeLearn: getNewAvgAge(
                request.body.ageLearn,
                quizInfo.statAvgAgeLearn,
                quizInfo.statCount,
              ),
            },
            $inc: quizUpdateDelta,
          },
        )
      } catch (e) {
        throw new ExError('fail to update quiz', {
          type: 'int',
          code: 'DB_UPDATE_QUIZ',
          err: e,
        })
      }

      // 과제 정보 업데이트
      if (subjectId != null) {
        const subject = await SubjectGetFromID(subjectId)
        try {
          await CollSubject.findOneAndUpdate(
            {
              _id: subjectId,
              userId: userType === 'std' ? userId : classId,
              userType: userType === 'std' ? 'std' : 'class',
            },
            {
              $inc: { tryCount: 1 },
            },
          )
        } catch (e) {
          throw new ExError('fail to update subject', {
            type: 'int',
            code: 'DB_UPDATE_SUBJECT',
            err: e,
          })
        }

        if (
          subject == null ||
          !subject.userId.equals(userId) ||
          subject.userType !== (userType === 'org' ? 'class' : 'std')
        ) {
          throw new ExError('subject not existed', {
            type: 'ext',
            code: 'SUBJECT_NOTFOUND',
          })
        }
      }

      // 오류 보고 정보 추가
      const requestReport = request.body.report
      if (requestReport != null && requestReport.length > 0) {
        try {
          await CollQuizReport.insertMany(
            requestReport.map(
              (r): SchemaQuizReport => ({
                userId: userType === 'org' && classId != null ? classId : userId,
                userType: userType === 'org' ? 'class' : 'std',
                quizId: quizId,
                gameId: gameId,
                gameCount: gameInfo?.count,
                pos: r.pos,
                content: r.content,
                createdAt: new Date(),
              }),
            ),
          )
        } catch (e) {
          throw new ExError('fail to report quiz', {
            type: 'int',
            code: 'DB_INSERT_QUIZREPORT',
            err: e,
          })
        }
      }

      // 결과 업데이트
      const condUserId = userType === 'org' && classId != null ? classId : userId
      const condUserType = userType === 'org' ? 'class' : 'std'
      let historyId: ObjectId | null = null
      try {
        const insertResult = await CollHistory.insertOne({
          userId: userType === 'org' ? classId! : userId,
          userType: userType === 'org' ? 'class' : 'std',
          keywordId: keywordId,
          subjectId: subjectId,
          categoryId: quizInfo.categoryId,
          gameId: gameId,
          gameCount: gameInfo?.count,
          gameMember:
            gameInfo == null
              ? undefined
              : GameGetOtherGameMemebers(gameInfo, condUserId, condUserType).map((m) => ({
                  id: StrToObjectId(m.id, 'ID'),
                  type: m.type,
                })),
          quizId: quizId,
          answerOrder: request.body.answerOrder,
          answerTime: request.body.answerTime,
          answerCorrect: request.body.answerCorrect,
          ageLearn: request.body.ageLearn,
          ageCognative: request.body.ageCognative,
          ageActivity: request.body.ageActivity,
          recordAt: new Date(),
        })
        historyId = insertResult.insertedId
      } catch (e) {
        throw new ExError('fail to insert history', {
          type: 'int',
          code: 'DB_INSERT_HISTORY',
          err: e,
        })
      }
      await PointUpdate(
        userId,
        request.body.answerCorrect.filter((a) => a).length,
        '+gamePlay',
        classId,
        historyId,
      )

      if (gameId == null || gameInfo == null) {
        // 혼자하기 게임일 겨우 각종 정보 업데이트
        reply.send(ResOkValue)
        return
      }

      // 같이하기 게임일 겨우 각종 정보 업데이트
      const gameMemberType = GameGetMemberType(gameInfo, condUserId, condUserType)

      // 유저의 게임 완료 처리
      let result: WithId<SchemaGame> | null = null
      try {
        if (gameMemberType === 'member') {
          result = await CollGame.findOneAndUpdate(
            {
              _id: gameId,
              'members.id': userType === 'org' ? classId : userId,
            },
            {
              $set: { 'members.$.status': 'join' },
            },
            { returnDocument: 'after' },
          )
        } else if (gameMemberType === 'host' && gameInfo.host.playing) {
          result = await CollGame.findOneAndUpdate(
            {
              _id: gameId,
            },
            {
              $set: { 'host.playing': false },
            },
            { returnDocument: 'after' },
          )
        }
      } catch (e) {
        throw new ExError('fail to update game', {
          type: 'int',
          code: 'DB_UPDATE_GAME',
          err: e,
        })
      }

      // 같이하기 관련 후처리
      let responseBody: WebsocketEventGameDone | undefined = undefined
      const newGameInfo = result
      if (newGameInfo != null) {
        // 현재 유저 외 모든 현재게임의 히스토리를 가져오기
        let histories: WithId<SchemaHistory>[]
        try {
          histories = await CollHistory.find({
            gameId: gameId,
            gameCount: newGameInfo.count,
          }).toArray()
        } catch (e) {
          throw new ExError('fail to find history for game', {
            type: 'int',
            code: 'DB_FIND_HISTORY',
            err: e,
          })
        }

        // 현재 게임 완료한 멤버들 점수들 매기고, 정렬
        const scoreInfo = histories
          .map((h) => ({
            id: h._id,
            userId: h.userId,
            userType: h.userType,
            correct: h.answerCorrect.filter((a) => a === true).length,
            solved: h.answerCorrect.length,
          }))
          .sort((r1, r2) =>
            r1.correct < r2.correct
              ? 1
              : r1.correct > r2.correct
              ? -1
              : r1.solved > r2.solved
              ? 1
              : -1,
          )

        // 상대전적 업데이트
        const vsHistories: SchemaHistoryVs[] = []
        await Promise.all(
          histories.map(async (h) => {
            if (condUserId.equals(h.userId) && condUserType === h.userType) {
              return
            }
            const userRank = scoreInfo.findIndex((s) => s.id == null)
            const historyRank = scoreInfo.findIndex((s) => s.id != null && s.id.equals(h._id))
            const isUserWin = userRank < historyRank

            let vsInfo: WithId<SchemaHistoryVs> | null = null
            try {
              vsInfo = await CollHistoryVs.findOne({
                $and: [
                  {
                    $or: [
                      { 'from.id': condUserId, 'from.type': condUserType },
                      { 'from.id': h.userId, 'from.type': h.userType },
                    ],
                  },
                  {
                    $or: [
                      { 'to.id': condUserId, 'to.type': condUserType },
                      { 'to.id': h.userId, 'to.type': h.userType },
                    ],
                  },
                ],
              })
            } catch (e) {
              throw new ExError('fail to get historyVs', {
                type: 'int',
                code: 'DB_GET_HISTORYVS',
                err: e,
              })
            }

            if (
              vsInfo != null &&
              vsInfo.lastGameId.equals(gameId) &&
              vsInfo.lastGameCount === newGameInfo.count
            ) {
              vsHistories.push(vsInfo)
              return
            }
            const isUserIsFrom =
              vsInfo == null ||
              (vsInfo.from.id.equals(condUserId) && vsInfo.from.type === condUserType)
            const emptyObjectId = ObjectId.generate(0)

            try {
              const updateResult = await CollHistoryVs.findOneAndUpdate(
                {
                  _id: vsInfo?._id ?? emptyObjectId,
                },
                {
                  $setOnInsert: {
                    from: { id: condUserId, type: condUserType },
                    to: { id: h.userId, type: h.userType },
                  },
                  $set: {
                    lastGameId: gameId,
                    lastGameCount: newGameInfo.count,
                  },
                  $inc: {
                    all: 1,
                    win: isUserIsFrom === isUserWin ? 1 : 0,
                  },
                },
                { upsert: true },
              )
              if (updateResult != null) {
                vsHistories.push(updateResult)
              }
            } catch (e) {
              throw new ExError('fail to upsert historyVs', {
                type: 'int',
                code: 'DB_UPSERT_HISTORYVS',
                err: e,
              })
            }
          }),
        )

        // 모든 멤버가 문제를 풀었으면 게임등수처리
        const isGameDone =
          !newGameInfo.host.playing && newGameInfo.members.every((m) => m.status !== 'play')
        if (isGameDone) {
          // 게임 등수 업데이트
          await Promise.all(
            scoreInfo.map(async (r, i) => {
              try {
                await CollHistory.updateOne({ _id: r.id }, { $set: { rank: i + 1 } })
                if (i === 0) {
                  await PointUpdate(
                    r.userId,
                    100,
                    '+gameRank',
                    r.userType === 'std' ? undefined : (await ClassGetFromID(r.userId))?.userId,
                    r.id,
                    newGameInfo.quizId,
                  )
                }
              } catch (e) {
                throw new ExError('fail to update history for game', {
                  type: 'int',
                  code: 'DB_UPDATE_HISTORY',
                  err: e,
                })
              }
            }),
          )
        }

        const gameReports = await CollQuizReport.find({
          gameId: gameId,
          gameCount: newGameInfo.count,
        }).toArray()

        await Promise.all(
          [newGameInfo.host, ...newGameInfo.members].map(async (m) => {
            const resultsForMember = (
              await Promise.all(
                GameGetAllGameMemebers(newGameInfo).map(async (n) => {
                  const currentInfo: Omit<SchemaGameMember, 'status'> | undefined =
                    newGameInfo?.members.find((o) => o.id.equals(n.id) && o.type === n.type) ??
                    (newGameInfo.host.id.equals(n.id) && newGameInfo.host.type === n.type
                      ? newGameInfo.host
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
                    n.id === m.id.toHexString() && n.type === m.type
                      ? undefined
                      : vsHistories.find(
                          (vh) =>
                            ((vh.from.id.equals(m.id) && vh.from.type === m.type) ||
                              (vh.from.id.equals(n.id) && vh.from.type === n.type)) &&
                            ((vh.to.id.equals(m.id) && vh.to.type === m.type) ||
                              (vh.to.id.equals(n.id) && vh.to.type === n.type)),
                        )

                  const rank =
                    scoreInfo.findIndex(
                      (ss) => ss.userId.equals(currentInfo.id) && ss.userType === currentInfo.type,
                    ) + 1

                  eventMember.rank = isGameDone && rank > 0 ? rank : undefined // 게임 등수
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
                            vsHistory.from.id.equals(m.id) && vsHistory.from.type === m.type
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
              gameId: gameId.toHexString(),
              gameCount: newGameInfo.count,
              event: 'gameDone',
              quizId: quizId.toHexString(),
              result: resultsForMember,
            }

            if (condUserId.equals(m.id) && condUserType === m.type) {
              responseBody = eventData
            }
            await WebsocketBroadcast([{ id: m.id.toHexString(), type: m.type }], eventData)
          }),
        )
      }

      // API 응답
      reply.send(responseBody ?? ResOkValue)
    },
  })
}
