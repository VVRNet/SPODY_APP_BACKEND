// import { Static, Type } from '@fastify/type-provider-typebox'
// import { FastifyInstance } from 'fastify'
// import { ObjectId, UpdateResult, WithId } from 'mongodb'
// import { DatabaseClient } from '../../db/common'
// import { CollNoti } from '../../db/noti'
// import { CollRelationFriend, SchemaRelationFriend } from '../../db/relationFriend'
// import { CollUser, SchemaUser } from '../../db/user'
// import { ExError } from '../../util/error'
// import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
// import { CtxUserId, RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

// const reqBody = Type.Object({
//   id: Type.String({
//     description: '초대할 유저 id',
//     minLength: 1,
//   }),
// })
// type reqBodyType = Static<typeof reqBody>

// export const ApiUserFriendInvite: RegisterApi = (
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
//       summary: '학생전용 - 친구 신청',
//       description: `[ 400에러 코드 ]
      
//       . FRIEND_WRONG_ID : 초대 대상 id가 존재하지 않음
//       . FRIEND_ALREADY_DONE : 이미 친구임
//       . FRIEND_ALREADY_INVITING : 이미 초대함
//       . FRIEND_ALREADY_INVITED : 이미 초대받음
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
//         throw new ExError('wrong class id', {
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
//       const existedRelationInvite = existedRelation.find((r) => r.status === 'invite')
//       if (existedRelationInvite != null) {
//         if (existedRelationInvite.fromUserId === userId) {
//           throw new ExError('already inviting', {
//             type: 'ext',
//             code: 'FRIEND_ALREADY_INVITING',
//           })
//         } else {
//           throw new ExError('already invited', {
//             type: 'ext',
//             code: 'FRIEND_ALREADY_INVITED',
//           })
//         }
//       }

//       // 친구 초대 처리
//       const session = DatabaseClient.startSession()
//       try {
//         session.startTransaction({
//           readPreference: 'primary',
//           readConcern: { level: 'local' },
//           writeConcern: { w: 'majority' },
//           maxCommitTimeMS: 1000,
//         })

//         // 관계 데이터 생성
//         let newRelation: UpdateResult<SchemaRelationFriend>
//         const now = new Date()
//         try {
//           newRelation = await CollRelationFriend.updateOne(
//             {
//               fromUserId: userId,
//               toUserId: inviteUserId,
//             },
//             {
//               $set: {
//                 status: 'invite',
//                 updateDate: now,
//               },
//               $setOnInsert: {
//                 fromUserId: userId,
//                 toUserId: inviteUserId,
//                 createDate: now,
//               },
//             },
//             { upsert: true },
//           )
//         } catch (e) {
//           throw new ExError('fail to upsert new relation friend', {
//             type: 'int',
//             code: 'DB_UPSERT_RELATION_FRIEND',
//             err: e,
//           })
//         }

//         // 초대대상 유저의 알림목록에 초대 추가
//         try {
//           await CollNoti.insertOne({
//             type: 'friendInvite',
//             userId: inviteUserId,
//             createDate: now,
//             relatedId: userId,
//           })
//         } catch (e) {
//           throw new ExError('fail to insert new relation friend', {
//             type: 'int',
//             code: 'DB_INSERT_RELATION_FRIEND',
//             err: e,
//           })
//         }

//         await session.commitTransaction()
//         await session.endSession()
//       } catch (e) {
//         await session.abortTransaction()
//         await session.endSession()
//         if (ExError.isExError(e)) {
//           throw e
//         } else {
//           throw new ExError('failed to create relation friend', {
//             type: 'int',
//             code: 'DB_RELATION_FRIEND',
//             err: e,
//           })
//         }
//       }

//       // TODO: 초대 대상에게 알림 및 푸시 (with userId)

//       // API 응답
//       reply.send(ResOkValue)
//     },
//   })
// }
