// import { Static, Type } from '@fastify/type-provider-typebox'
// import { FastifyInstance, FastifyPluginOptions } from 'fastify'

// const req = Type.Object({
//   id: Type.String({ format: 'email' }),
//   pw: Type.String(),
// })
// type reqType = Static<typeof req>

// const res = Type.Object({
//   isNeedAgreement: Type.Boolean({ description: '약관동의 필요 여부' }),
//   isNeedInfo: Type.Boolean({ description: '추가정보 필요 여부' }),
// })
// type resType = Static<typeof res>

// export const ApiTest = (app: FastifyInstance, opts: FastifyPluginOptions, done: () => void) => {
//   app.post<{ Body: reqType; Reply: resType }>(
//     '/',
//     // 스키마
//     {
//       schema: {
//         tags: ['인증'],
//         description: '로그인 수행',
//         body: req,
//         response: {
//           200: res,
//         },
//       },
//     },
//     // 핸들러
//     (request, reply) => {
//       reply.send({ isNeedAgreement: false, isNeedInfo: false })
//     },
//   )
//   done()
// }
