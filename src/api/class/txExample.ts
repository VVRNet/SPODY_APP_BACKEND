// // import { Static, Type } from '@fastify/type-provider-typebox'
// // import { FastifyInstance } from 'fastify'
// // import { InsertOneResult } from 'mongodb'
// // import { CollClass, SchemaClass } from '../../db/class'
// // import { DatabaseClient } from '../../db/common'
// // import { CollUser } from '../../db/user'
// // import { ExError } from '../../util/error'
// // import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
// // import { CtxUserId, RegisterApi } from '../common'

// // const reqBody = Type.Object({
// //   name: Type.String({
// //     description: '반 이름',
// //     minLength: 1,
// //   }),
// //   interest: Type.Optional(
// //     Type.Array(Type.String(), {
// //       description: '관심사',
// //       minItems: 1,
// //     }),
// //   ),
// // })
// // type reqBodyType = Static<typeof reqBody>

// // const resBody = Type.Object({
// //   classId: Type.String({ description: '만들어진 반 id', examples: ['64ad90e45aaeb63c51a82307'] }),
// // })
// // type resBodyType = Static<typeof resBody>

// export const ApiClassAdd: RegisterApi = (
//   app: FastifyInstance,
//   url: string,
//   apiRole?: keyof typeof ApiRoleCheckers,
// ): void => {
//   app.route<{ Body: reqBodyType; Reply: resBodyType }>({
//     method: 'post',
//     url: url,
//     preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

//     // API schema ====================================================
//     schema: {
//       tags: ['기관-반'],
//       summary: '추가',
//       description: `[ 400에러 코드 ]
//       . 없음
// `,
//       headers: apiRole != null ? JwtAuthHeader : {},
//       body: reqBody,
//       response: {
//         200: resBody,
//       },
//     },

//     // API handler ====================================================
//     handler: async (request, reply) => {
//       let newClass: InsertOneResult<SchemaClass>
//       const session = DatabaseClient.startSession()
//       try {
//         session.startTransaction({
//           readPreference: 'primary',
//           readConcern: { level: 'local' },
//           writeConcern: { w: 'majority' },
//           maxCommitTimeMS: 1000,
//         })

//         // 반 정보 추가
//         newClass = await CollClass.insertOne(
//           {
//             name: request.body.name,
//             interest: request.body.interest,
//             createData: new Date(),
//           },
//           { session: session },
//         )
//         // 유저에 반 정보 업데이트
//         await CollUser.findOneAndUpdate(
//           {
//             _id: CtxUserId(request),
//           },
//           {
//             $addToSet: { classList: newClass.insertedId },
//           },
//           { session: session },
//         )
//       } catch (e) {
//         throw new ExError('failed to insert class', {
//           type: 'int',
//           code: 'DB_INSERT_CLASS',
//           err: e,
//         })
//       }

//       // API 응답
//       reply.send({ classId: newClass.insertedId.toHexString() })
//     },
//   })
// }
