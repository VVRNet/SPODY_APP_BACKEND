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
//     description: '친구 유저 id',
//   }),
//   name: Type.String({
//     description: '친구 유저 이름',
//   }),
// })
// type resBodyItemType = Static<typeof resBodyItem>

// const resBody = Type.Object({
//   inviting: Type.Array(resBodyItem, {
//     description: '유저가 초대한 리스트',
//   }),
//   invited: Type.Array(resBodyItem, {
//     description: '유저가 초대받은 리스트',
//   }),
// })
// type resBodyType = Static<typeof resBody>

// export const ApiUserFriendInviteList: RegisterApi = (
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
//       summary: '학생전용 - 친구 초대 현황 확인',
//       description: `[ 400에러 코드 ]
      
//       . 없음
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
//           $and: [
//             {
//               $or: [
//                 {
//                   fromUserId: userId,
//                 },
//                 {
//                   toUserId: userId,
//                 },
//               ],
//             },
//             { status: 'invite' },
//           ],
//         }).toArray()
//       } catch (e) {
//         throw new ExError('fail to get relation friend', {
//           type: 'int',
//           code: 'DB_GET_RELATION_FRIEND',
//           err: e,
//         })
//       }

//       const invitingFriendIds = existedRelation
//         .filter((r) => r.fromUserId === userId)
//         .map((r) => r.toUserId)
//       const invitedFriendIds = existedRelation
//         .filter((r) => r.toUserId === userId)
//         .map((r) => r.fromUserId)

//       // 관계 내 유저검색
//       let friendInfos: WithId<SchemaUser>[]
//       try {
//         friendInfos = await CollUser.find({
//           _id: { $in: [...invitingFriendIds, ...invitedFriendIds] },
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
//         inviting: friendInfos
//           .filter((f) => invitingFriendIds.includes(f._id))
//           .map((f) => ({
//             id: f._id.toHexString(),
//             name: f.name ?? '',
//           })),
//         invited: friendInfos
//           .filter((f) => invitedFriendIds.includes(f._id))
//           .map((f) => ({
//             id: f._id.toHexString(),
//             name: f.name ?? '',
//           })),
//       })
//     },
//   })
// }
