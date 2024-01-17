// import { Static, Type } from '@fastify/type-provider-typebox'
// import { FastifyInstance } from 'fastify'
// import { ObjectId, WithId } from 'mongodb'
// import { CollRelationFriend, SchemaRelationFriend } from '../../db/relationFriend'
// import { CollUser, SchemaUser } from '../../db/user'
// import { ExError } from '../../util/error'
// import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
// import { CtxUserId, RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

// const reqBody = Type.Object({
//   id: Type.String({
//     description: '초대한 유저 id',
//     minLength: 1,
//   }),
//   approve: Type.Boolean({
//     description: '초대 승인 여부',
//   }),
// })
// type reqBodyType = Static<typeof reqBody>

// export const ApiUserFriendReply: RegisterApi = (
//   app: FastifyInstance,
//   url: string,
//   apiRole?: keyof typeof ApiRoleCheckers,
// ): void => {
//   app.route<{ Body: reqBodyType; Reply: ResOkType }>({
//     method: 'post',
//     url: url,
//     preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

//     // API schema ====================================================
//     schema: {
//       tags: ['유저'],
//       summary: '학생전용 - 친구 신청 응답',
//       description: `[ 400에러 코드 ]
      
//       . FRIEND_WRONG_ID : 초대한 id가 존재하지 않음
//       . FRIEND_ALREADY_DONE : 이미 친구임
//       . FRIEND_ALREADY_INVITING : 유저가 초대한 상태임
//       . FRIEND_NOTFOUND_INVITING : 초대받지 않았음
// `,
//       headers: apiRole != null ? JwtAuthHeader : {},
//       body: reqBody,
//       response: {
//         200: ResOk,
//       },
//     },

//     // API handler ====================================================
//     handler: async (request, reply) => {
//       let inviteUserId: ObjectId
//       try {
//         inviteUserId = new ObjectId(request.body.id)
//       } catch (e) {
//         throw new ExError('wrong invite id', {
//           type: 'ext',
//           code: 'FRIEND_WRONG_ID',
//           err: e,
//         })
//       }

//       // 존재하는 유저인지 확인
//       let userInfo: WithId<SchemaUser> | null = null
//       try {
//         userInfo = await CollUser.findOne({
//           _id: inviteUserId,
//         })
//       } catch (e) {
//         throw new ExError('failed to get user', {
//           type: 'int',
//           code: 'DB_GET_USER',
//           err: e,
//           info: {
//             id: request.body.id,
//           },
//         })
//       }
//       if (userInfo == null) {
//         throw new ExError('email not existed', {
//           type: 'ext',
//           code: 'FRIEND_WRONG_ID',
//         })
//       }

//       // 이미 존재하는 관계가 있는지 검색
//       const userId = CtxUserId(request)
//       let existedRelation: WithId<SchemaRelationFriend>[]
//       try {
//         existedRelation = await CollRelationFriend.find({
//           $or: [
//             {
//               fromUserId: userId,
//               toUserId: inviteUserId,
//             },
//             {
//               fromUserId: inviteUserId,
//               toUserId: userId,
//             },
//           ],
//         }).toArray()
//       } catch (e) {
//         throw new ExError('fail to insert new relation friend', {
//           type: 'int',
//           code: 'DB_GET_RELATION_FRIEND',
//           err: e,
//         })
//       }

//       if (existedRelation.some((r) => r.status === 'ok')) {
//         throw new ExError('already friend', {
//           type: 'ext',
//           code: 'FRIEND_ALREADY_DONE',
//         })
//       }
//       const existedRelationInvites = existedRelation.filter((r) => r.status === 'invite')
//       if (
//         existedRelationInvites.some((i) => i.fromUserId === userId && i.toUserId === inviteUserId)
//       ) {
//         throw new ExError('already inviting', {
//           type: 'ext',
//           code: 'FRIEND_ALREADY_INVITING',
//         })
//       }
//       if (
//         !existedRelationInvites.some((i) => i.fromUserId === inviteUserId && i.toUserId === userId)
//       ) {
//         throw new ExError('no inviting', {
//           type: 'ext',
//           code: 'FRIEND_NOTFOUND_INVITING',
//         })
//       }

//       // 거절일 경우, 관계DB 업데
//       try {
//         await CollRelationFriend.updateOne(
//           {
//             fromUserId: inviteUserId,
//             toUserId: userId,
//           },
//           {
//             $set: {
//               status: request.body.approve ? 'ok' : 'reject',
//               updateDate: new Date(),
//             },
//           },
//         )
//       } catch (e) {
//         throw new ExError('failed to update relation friend', {
//           type: 'int',
//           code: 'DB_UPDATE_RELATION_FRIEND',
//           err: e,
//         })
//       }

//       // TODO: 승인일 경우, 초대자에게에게 알림 및 푸시 (with userId)

//       // API 응답
//       reply.send(ResOkValue)
//     },
//   })
// }
