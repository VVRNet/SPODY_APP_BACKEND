import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { Document, ObjectId } from 'mongodb'
import { CollFollow } from '../../db/follow'
import { CollHistoryVs, SchemaHistoryVs } from '../../db/historyVs'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { ClassCheckAvailable, ClassGetFromID } from '../class/_service'
import { CtxUserId, CtxUserType, RegisterApi, StrToObjectId } from '../common'
import { UserGetFromID } from '../user/_service'

const reqQuery = Type.Object({
  following: Type.Boolean({
    description: 'true면 팔로우중인 친구만 확인, false면 전체 확인',
  }),
  classId: Type.Optional(
    Type.String({
      description: '유저가 기관일 경우, 반 id',
      minLength: 1,
    }),
  ),
  page: Type.Optional(
    Type.Number({
      minimum: 1,
      description: '몇페이지에 해당하는 내용인지. 1부터 시작 - 주어지는값이 없으면 1로 간주',
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({
      minimum: 1,
      description: '페이지 당 건수. - 주어지는값이 없으면 10으로 간주',
    }),
  ),
})
type reqQueryType = Static<typeof reqQuery>

const resBody = Type.Object({
  list: Type.Array(
    Type.Object({
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
      win: Type.Number({ description: '승리회수' }),
      all: Type.Number({ description: '총 대결 회수' }),
    }),
  ),
  total: Type.Number({ description: '전체 검색가능한 기록 수' }),
  last: Type.Boolean({ description: '마지막 페이지인지 여부' }),
})
type resBodyType = Static<typeof resBody>

export const ApiHistoryVs: RegisterApi = (
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
      summary: '다른 유저들과의 상대전적을 알려줌',
      description: `전적이 많은 상대부터 보여줍니다!`,
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
      await ClassCheckAvailable(userType, userId, classId)

      const condUserId = userType === 'org' && classId != null ? classId : userId
      const condUserType = userType === 'org' ? 'class' : 'std'

      let listFollowingIds: ObjectId[] | null = null
      if (query.following) {
        const fileter = {
          id: userType === 'std' ? userId : classId,
          orgId: userType === 'std' ? null : userId,
        }
        try {
          const listFollowing = await CollFollow.find({
            fromId: fileter.id,
            fromOrgId: fileter.orgId as ObjectId | undefined,
          }).toArray()
          listFollowingIds = listFollowing.map((f) => f.toId)
        } catch (e) {
          throw new ExError('fail to get existed follow', {
            type: 'int',
            code: 'DB_GET_FOLLOW',
            err: e,
          })
        }
      }

      const pageSize = query.pageSize ?? 10
      const pageSkipCount = ((query.page ?? 1) - 1) * pageSize

      const condMatchBase = {
        $or: [
          { 'from.id': condUserId, 'from.type': condUserType },
          { 'to.id': condUserId, 'to.type': condUserType },
        ],
      }

      const pipelines: Document[] = [
        {
          $match:
            listFollowingIds == null
              ? condMatchBase
              : {
                  $and: [
                    condMatchBase,
                    {
                      $or: [
                        { 'from.id': { $in: listFollowingIds } },
                        { 'to.id': { $in: listFollowingIds } },
                      ],
                    },
                  ],
                },
        },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [
              {
                $sort: {
                  all: -1,
                },
              },
              { $skip: pageSkipCount },
              { $limit: pageSize },
              { $project: { question: 0 } },
            ],
          },
        },
        {
          $project: {
            result: '$data',
            total: { $arrayElemAt: ['$metadata.total', 0] },
          },
        },
      ]
      type historyVsType = {
        result: SchemaHistoryVs[]
        total?: number
      }
      let historyVs: historyVsType
      try {
        historyVs = (await CollHistoryVs.aggregate<historyVsType>(pipelines).toArray())[0]
      } catch (e) {
        throw new ExError('failed to get historyVs list', {
          type: 'int',
          code: 'DB_FIND_QUIZ',
          err: e,
        })
      }

      const vsInfos = await Promise.all(
        historyVs.result.map(async (v) => {
          const target =
            v.from.id.equals(condUserId) && v.from.type === condUserType ? v.to : v.from
          const classInfo = target.type === 'std' ? null : await ClassGetFromID(target.id)
          const userInfo = await UserGetFromID(classInfo == null ? target.id : classInfo.userId)
          if (userInfo == null) {
            throw new ExError('failed to get historyVs list', {
              type: 'int',
              code: 'VS_NOTAVAIABLE',
            })
          }
          return {
            userId: (classInfo?._id ?? userInfo._id).toHexString(), // 학생/반 id
            userType: target.type, // 방장유저 종류 (학생/반)
            name: classInfo?.name ?? userInfo.name ?? '',
            orgName: classInfo == null ? undefined : userInfo.name,
            imgUrl: userInfo.imgUrl,
            country: userInfo.country,
            win:
              v.from.id.equals(condUserId) && v.from.type === condUserType ? v.win : v.all - v.win,
            all: v.all,
          }
        }),
      )

      // API 응답
      reply.send({
        total: historyVs.total ?? 0,
        last: (historyVs.total ?? 0) - pageSkipCount <= pageSize,
        list: vsInfos,
      })
    },
  })
}
