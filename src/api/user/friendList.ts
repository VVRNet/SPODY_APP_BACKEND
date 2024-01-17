// import { Static, Type } from '@fastify/type-provider-typebox'
// import { FastifyInstance } from 'fastify'
// import { WithId } from 'mongodb'
// import { CollRelationFriend, SchemaRelationFriend } from '../../db/relationFriend'
// import { CollUser, SchemaUser } from '../../db/user'
// import { ExError } from '../../util/error'
// import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
// import { CtxUserId, RegisterApi } from '../common'

// const resBodyItem = Type.Object({
//   id: Type.String({
//     description: '친구 학생/반 id',
//   }),
//   name: Type.String({
//     description: '친구 학생/반 이름',
//   }),
//   type: Type.Optional(
//     Type.Enum<{ std: 'std'; class: 'class' }>(
//       {
//         std: 'std',
//         class: 'class',
//       },
//       { description: '종류 - std(학생),class(반)', examples: ['std'] },
//     ),
//   ),
//   orgName: Type.String({
//     description: '친구가 반일 경우, 기관이름',
//   }),
// })
// type resBodyItemType = Static<typeof resBodyItem>

// const resBody = Type.Object({
//   list: Type.Array(resBodyItem, {
//     description: '친구 목록. 없으면 빈배열로 응답',
//   }),
// })
// type resBodyType = Static<typeof resBody>

// export const ApiUserFriendList: RegisterApi = (
//   app: FastifyInstance,
//   url: string,
//   apiRole?: keyof typeof ApiRoleCheckers,
// ): void => {
//   app.route<{ Reply: resBodyType }>({
//     method: 'get',
//     url: url,
//     preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

//     // API schema ====================================================
//     schema: {
//       tags: ['유저'],
//       summary: '친구 목록 확인',
//       description: `[ 400에러 코드 ]

//       . FRIEND_WRONG_ID : 초대 대상 id가 존재하지 않음
//       . FRIEND_ALREADY_DONE : 이미 친구임
//       . FRIEND_ALREADY_INVITING : 이미 초대함
//       . FRIEND_ALREADY_INVITED : 이미 초대받음
// `,
//       headers: apiRole != null ? JwtAuthHeader : {},
//       response: {
//         200: resBody,
//       },
//     },

//     // API handler ====================================================
//     handler: async (request, reply) => {
//       // 관계 검색, 친구 id목록 확인
//       const userId = CtxUserId(request)
//       let existedRelation: WithId<SchemaRelationFriend>[]
//       try {
//         existedRelation = await CollRelationFriend.find({
//           $or: [
//             {
//               fromUserId: userId,
//             },
//             {
//               toUserId: userId,
//             },
//           ],
//         }).toArray()
//       } catch (e) {
//         throw new ExError('fail to get relation friend', {
//           type: 'int',
//           code: 'DB_GET_RELATION_FRIEND',
//           err: e,
//         })
//       }
//       const friendIds = existedRelation.map((r) =>
//         r.fromUserId === userId ? r.toUserId : r.fromUserId,
//       )
//       if (friendIds.length < 1) {
//         reply.send({ list: [] })
//         return
//       }

//       // 관계 내 유저검색
//       let friendInfos: WithId<SchemaUser>[]
//       try {
//         friendInfos = await CollUser.find({
//           _id: { $in: friendIds },
//         }).toArray()
//       } catch (e) {
//         throw new ExError('fail to get friend users', {
//           type: 'int',
//           code: 'DB_GET_FRIEND_USERS',
//           err: e,
//         })
//       }

//       // API 응답
//       reply.send({
//         list: friendInfos.map((f) => ({
//           id: f._id.toHexString(),
//           name: f.name ?? '',
//         })),
//       })
//     },
//   })
// }
