import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollHistory, SchemaHistory } from '../../db/history'
import { CollHistoryVs, SchemaHistoryVs } from '../../db/historyVs'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable, ClassGetFromID } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { UserGetFromID } from '../user/_service'

const reqQuery = Type.Object({
  gameId: Type.String({
    description: '게임 ID',
    minLength: 1,
  }),
  gameCount: Type.Number({
    description: '게임 회차',
    minimum: 1,
  }),
  language: Type.Enum<{ ko: 'ko'; en: 'en'; ja: 'ja'; zh: 'zh'; es: 'es'; fi: 'fi'; fr: 'fr' }>(
    { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh', es: 'es', fi: 'fi', fr: 'fr' },
    {
      description:
        '언어코드 - ko:한국어 en:영어 ja:일본어 zh:중국어 es:스페인어 fi:핀란드어 fr:프랑스어',
      examples: ['ko'],
    },
  ),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  members: Type.Array(
    Type.Object({
      id: Type.String({ description: '개인기록 id' }),
      userId: Type.String({ description: '학생/반의 id' }),
      userType: Type.Enum<{ std: 'std'; class: 'class' }>(
        {
          std: 'std',
          class: 'class',
        },
        { description: '학생/반 여부 - std(학생),class(반)', examples: ['std'] },
      ),
      name: Type.Optional(Type.String({ description: '학생/반의 이름' })),
      orgName: Type.Optional(Type.String({ description: '반일 경우, 기관의 이름' })),
      imgUrl: Type.Optional(Type.String({ description: '프로필 이미지 url' })),
      country: Type.Optional(Type.String({ description: '국가' })),
      ageActivity: Type.Number({ description: '운동능력 나이' }),
      ageCognative: Type.Number({ description: '인지능력 나이' }),
      ageLearn: Type.Number({ description: '학습능력 나이' }),
      answerCorrect: Type.Array(Type.Boolean(), { description: '정답 여부' }),
      answerOrder: Type.Array(Type.Number(), { description: '출제 문제 순서' }),
      answerTime: Type.Array(Type.Number(), { description: '답변 소요시간' }),
      rank: Type.Optional(Type.Number({ description: '게임등수, 이 항목이 없다면 혼자한 게임' })),
      win: Type.Number({ description: '승리회수' }),
      all: Type.Number({ description: '총 대결 회수' }),
    }),
  ),
  quizId: Type.String({ description: '퀴즈 id' }),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryGame: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Querystring: reqQueryType; Reply: resBodyType }>({
    method: 'get',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['기록'],
      summary: '게임 기록 조회',
      //       description: `[ 400에러 코드 ]

      //       . PARAM_TIME_WRONG : 시간정보가 잘못됨 - 최대나이가 최소나이보다 같거나 커야함
      //       . PARAM_KEYWORD_VALIDATE : 키워드 관련 요청 파마리터가 모두 옴. id랑 단어중 하나만 필요
      //       . KEYWORD_WRONG_ID : 요청 내 keyword id 형식이 잘못됨
      //       . KEYWORD_NOTFOUND : 요청 내 keyword id 가 존재하지 않음
      // `,
      headers: apiRole != null ? JwtAuthHeader : {},
      querystring: reqQuery,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const query = request.query
      // 파라미터 objectID 변환
      let classId: ObjectId | undefined
      if (query.classId != null) {
        classId = StrToObjectId(query.classId, 'CLASS')
      }
      // 반 파라미터 유효성 및 존재하는 반인지 확인
      const userId = CtxUserId(request)
      const userType = CtxUserType(request)

      const gameId = StrToObjectId(query.gameId, 'GAME')
      await ClassCheckAvailable(userType, userId, classId)

      let histories: WithId<SchemaHistory>[]
      try {
        histories = await CollHistory.find({ gameId: gameId, gameCount: query.gameCount }).toArray()
      } catch (e) {
        throw new ExError('fail to get history', {
          type: 'int',
          code: 'DB_HISTORY_USER',
          err: e,
        })
      }

      if (histories.length < 1) {
        throw new ExError('no history', {
          type: 'ext',
          code: 'HISTORY_NOTEXISTED',
        })
      }

      let vsHistories: WithId<SchemaHistoryVs>[]
      try {
        vsHistories = await CollHistoryVs.find({
          lastGameId: gameId,
        }).toArray()
      } catch (e) {
        throw new ExError('fail to get historyVs', {
          type: 'int',
          code: 'DB_GET_HISTORYVS',
          err: e,
        })
      }

      const condUserId = userType === 'org' && classId != null ? classId : userId
      const condUserType = userType === 'org' ? 'class' : 'std'

      const resultsForMember = await Promise.all(
        histories.map(async (h) => {
          const classInfo = h.userType === 'std' ? null : await ClassGetFromID(h.userId)
          const userInfo = await UserGetFromID(classInfo == null ? h.userId : classInfo.userId)
          if (userInfo == null) {
            throw new ExError('failed to get historyVs list', {
              type: 'int',
              code: 'HISTORY_NOTAVAIABLE',
            })
          }

          let win = 0
          let all = 0
          if (!h.userId.equals(condUserId) || h.userType !== condUserType) {
            const vsHistory = vsHistories.find(
              (v) =>
                (v.from.id.equals(h.userId) && v.from.type === h.userType) ||
                (v.to.id.equals(h.userId) && v.to.type === h.userType),
            )
            if (vsHistory != null) {
              win =
                vsHistory.from.id.equals(condUserId) && vsHistory.from.type === condUserType
                  ? vsHistory.win
                  : vsHistory.all - vsHistory.win
              all = vsHistory.all
            }
          }

          return {
            id: h._id.toHexString(),
            userId: (classInfo?._id ?? userInfo._id).toHexString(), // 학생/반 id
            userType: h.userType, // 유저 종류 (학생/반)
            name: classInfo?.name ?? userInfo.name ?? '',
            orgName: classInfo == null ? undefined : userInfo.name,
            imgUrl: userInfo.imgUrl,
            country: userInfo.country,
            ageActivity: h.ageActivity,
            ageCognative: h.ageCognative,
            ageLearn: h.ageLearn,
            answerCorrect: h.answerCorrect,
            answerOrder: h.answerOrder,
            answerTime: h.answerTime,
            rank: h.rank,
            win,
            all,
          }
        }),
      )

      // 후처리
      reply.send({
        members: resultsForMember,
        quizId: histories[0].quizId.toHexString(),
      })
    },
  })
}
