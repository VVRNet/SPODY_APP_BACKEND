import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { ObjectId, WithId } from 'mongodb'
import { CollClass } from '../../db/class'
import { CollUser, SchemaUser } from '../../db/user'
import { CollUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi } from '../common'

const reqBody = Type.Object({
  name: Type.String({
    description: '반 이름',
    minLength: 1,
  }),
  interest: Type.Optional(
    Type.Array(Type.String(), {
      description: '관심사',
      minItems: 1,
    }),
  ),
  findId: Type.Optional(
    Type.String({
      description: '검색Id',
      minLength: 1,
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

const resBody = Type.Object({
  classId: Type.String({ description: '만들어진 반 id', examples: ['64ad90e45aaeb63c51a82307'] }),
})
type resBodyType = Static<typeof resBody>

export const ApiClassAdd: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: resBodyType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['반 (기관 전용)'],
      summary: '반 추가',
      description: `[ 400에러 코드 ]
      
      . FINDID_DUPLICATE : 동일한 검색id가 이미 있음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: resBody,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)

      // 유저 검색
      let userInfo: WithId<SchemaUser> | null = null
      try {
        userInfo = await CollUser.findOne({
          _id: userId,
        })
      } catch (e) {
        throw new ExError('failed to get user', {
          type: 'int',
          code: 'DB_GET_USER',
          err: e,
        })
      }
      if (userInfo == null) {
        throw new ExError('user type is wrong', {
          type: 'int',
          code: 'USER_INFO_NOTFOUND',
        })
      }

      const requestBody = request.body
      const newClassId = new ObjectId(ObjectId.generate())

      // 검색id 정보 추가
      if (requestBody.findId != null) {
        try {
          await CollUserFindId.insertOne({
            name: requestBody.findId,
            userId: userId,
            classId: newClassId,
          })
        } catch (e) {
          if ((e as Error).message.includes('E11000 duplicate key error')) {
            throw new ExError('failed to insert find id', {
              type: 'ext',
              code: 'FINDID_DUPLICATE',
              err: e,
            })
          }
          throw new ExError('failed to insert find id', {
            type: 'int',
            code: 'DB_INSERT_FINDID',
            err: e,
          })
        }
      }

      // 반 정보 추가
      try {
        await CollClass.insertOne({
          _id: newClassId,
          name: requestBody.name,
          interest: requestBody.interest,
          userId: userId,
          createDate: new Date(),
        })
      } catch (e) {
        throw new ExError('failed to insert class', {
          type: 'int',
          code: 'DB_INSERT_CLASS',
          err: e,
        })
      }

      // API 응답
      reply.send({ classId: newClassId.toHexString() })
    },
  })
}
