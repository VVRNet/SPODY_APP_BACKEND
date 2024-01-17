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
//     description: '친구를 끊을 유저 id',
//     minLength: 1,
//   }),
// })
// type reqBodyType = Static<typeof reqBody>

// export const ApiUserFriendDeny: RegisterApi = (
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
//       summary: '학생전용 - 친구 관계 끊기',
//       description: `[ 400에러 코드 ]
      
//       . FRIEND_WRONG_ID : 해당 유저id가 존재하지 않음
//       . FRIEND_NOTFOUND : 해당 유저와 친구가 아님
// `,
//       headers: apiRole != null ? JwtAuthHeader : {},
//       body: reqBody,
//       response: {
//         200: ResOk,
//       },
//     },

//     // API handler ====================================================
//     handler: async (request, reply) => {
//       let byeUserId: ObjectId
//       try {
//         byeUserId = new ObjectId(request.body.id)
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
//           _id: byeUserId,
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
//               toUserId: byeUserId,
//             },
//             {
//               fromUserId: byeUserId,
//               toUserId: userId,
//             },
//           ],
//         }).toArray()
//       } catch (e) {
//         throw new ExError('fail to insert relation friend', {
//           type: 'int',
//           code: 'DB_GET_RELATION_FRIEND',
//           err: e,
//         })
//       }
//       const existedFriendRelations = existedRelation.filter((r) => r.status === 'ok')
//       if (existedFriendRelations.length < 1) {
//         throw new ExError('already friend', {
//           type: 'ext',
//           code: 'FRIEND_NOTFOUND',
//         })
//       }

//       // 관계DB 업데이트
//       try {
//         await CollRelationFriend.updateMany(
//           {
//             _id: { $in: existedFriendRelations.map((r) => r._id) },
//           },
//           {
//             $set: {
//               status: 'deny',
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

//       // API 응답
//       reply.send(ResOkValue)
//     },
//   })
// }
