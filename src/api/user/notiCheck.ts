// import { Static, Type } from '@fastify/type-provider-typebox'
// import { FastifyInstance } from 'fastify'
// import { CollClass, SchemaClass } from '../../db/class'
// import { CollUser, SchemaUser } from '../../db/user'
// import { ExError } from '../../util/error'
// import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
// import { CtxUserId, RegisterApi, ResOk, ResOkType } from '../common'

// const reqQuery = Type.Optional(
//   Type.Object({
//     time: Type.Number({
//       description:
//         '새로운 알람들 확인 완료한 시간 (unix 초 시간). 업데이트 없이 단순 확인용이면 보내지 않음',
//       minimum: 1,
//     }),
//   }),
// )
// type reqQueryType = Static<typeof reqQuery>

// export const ApiUserNotiCheckUpdate: RegisterApi = (
//   app: FastifyInstance,
//   url: string,
//   apiRole?: keyof typeof ApiRoleCheckers,
// ): void => {
//   app.route<{ Querystring: reqQueryType; Reply: ResOkType }>({
//     method: 'get',
//     url: url,
//     preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

//     // API schema ====================================================
//     schema: {
//       tags: ['유저'],
//       summary:
//         '최근 확인한 알람 시간 업데이트 및 이후 새로운 알람들 받기. body내용이 없으면 단순히 새로운 알람들 리턴',
//       description: `[ 400에러 코드 ]
//       . 없음
// `,
//       headers: apiRole != null ? JwtAuthHeader : {},
//       querystring: reqQuery,
//       response: {
//         200: ResOk,
//       },
//     },

//     // API handler ====================================================
//     handler: async (request, reply) => {
//       // 학생 검색
//       let students: SchemaUser[]
//       try {
//         students = await CollUser.find<SchemaUser>({
//           type: 'std',
//           name: { $regex: request.params.name, $options: 'i' },
//         }).toArray()
//       } catch (e) {
//         throw new ExError('failed to get code', {
//           type: 'int',
//           code: 'DB_SEARCH_STD',
//           err: e,
//         })
//       }

//       // 반 검색
//       let classes: SchemaClass[]
//       try {
//         classes = await CollClass.find<SchemaClass>({
//           status: 'ok',
//           name: { $regex: request.params.name, $options: 'i' },
//         }).toArray()
//       } catch (e) {
//         throw new ExError('failed to get code', {
//           type: 'int',
//           code: 'DB_SEARCH_CLASS',
//           err: e,
//         })
//       }

//       // 검색결과 정리 및 API 응답
//       const userIdStr = CtxUserId(request).toHexString()
//       reply.send({
//         list: [
//           ...students
//             .filter((s) => s._id?.toHexString() !== userIdStr)
//             .map(
//               (s): resBodyItemType => ({
//                 id: s._id?.toHexString() ?? '',
//                 name: s.name ?? '',
//                 type: 'std',
//               }),
//             ),
//           ...classes
//             .filter((c) => c.userId.toHexString() !== userIdStr)
//             .map(
//               (c): resBodyItemType => ({
//                 id: c._id?.toHexString() ?? '',
//                 name: c.name ?? '',
//                 type: 'class',
//               }),
//             ),
//         ],
//       })
//     },
//   })
// }
