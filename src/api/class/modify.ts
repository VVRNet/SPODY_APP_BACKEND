import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { MatchKeysAndValues } from 'mongodb'
import { CollClass, SchemaClass } from '../../db/class'
import { CollUserFindId } from '../../db/userFindId'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import {
  CtxUserId,
  CtxUserType,
  RegisterApi,
  ResOk,
  ResOkType,
  ResOkValue,
  StrToObjectId,
} from '../common'
import { ClassCheckAvailable } from './_service'

const reqBody = Type.Object({
  name: Type.Optional(
    Type.String({
      description: '변경하는 반 이름',
      minLength: 1,
    }),
  ),
  interest: Type.Optional(
    Type.Array(Type.String(), {
      description: '변경하는 관심사',
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

const param = Type.Object({
  classId: Type.String({
    description: '변경할 반 id',
    minLength: 1,
  }),
})
type paramType = Static<typeof param>

export const ApiClassModify: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Params: paramType; Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: `${url}/:classId`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['반 (기관 전용)'],
      summary: '반 정보 변경',
      description: `[ 400에러 코드 ]
      
      . CLASS_WRONG_ID : 잘못된 형식의 반 id
      . CLASS_NOTFOUND : 수정할 반을 찾지 못함
      . CLASS_NO_CHANGE : 수정할 정보가 없음
      . FINDID_DUPLICATE : 동일한 검색id가 이미 있음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      params: param,
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      // 파라미터 objectID 변환
      const userId = CtxUserId(request)
      const classId = StrToObjectId(request.params.classId, 'CLASS')
      const requestBody = request.body

      // 반 파라미터 유효성 및 존재하는 반인지 확인
      await ClassCheckAvailable(CtxUserType(request), CtxUserId(request), classId)

      // 업데이트 데이터 정리
      const update: MatchKeysAndValues<SchemaClass> = {}
      for (const k of ['name', 'interest']) {
        const value = requestBody[k as keyof reqBodyType]
        if (value == null) {
          continue
        }
        update[k] = value
      }
      if (Object.entries(update).length < 1 && requestBody.findId == null) {
        throw new ExError('nothing change', {
          type: 'ext',
          code: 'CLASS_NO_CHANGE',
        })
      }

      // 검색id 정보 추가
      if (requestBody.findId != null) {
        try {
          await CollUserFindId.findOneAndUpdate(
            {
              userId: userId,
              classId: classId,
            },
            {
              $set: {
                name: requestBody.findId,
              },
              $setOnInsert: {
                userId: userId,
                classId: classId,
              },
            },
            { upsert: true },
          )
        } catch (e) {
          if ((e as Error).message.includes('E11000 duplicate key error')) {
            throw new ExError('failed to upsert find id', {
              type: 'ext',
              code: 'FINDID_DUPLICATE',
              err: e,
            })
          }
          throw new ExError('failed to upsert find id', {
            type: 'int',
            code: 'DB_UPSERT_FINDID',
            err: e,
          })
        }
      }

      // 반정보 업데이트
      if (Object.entries(update).length > 0) {
        try {
          await CollClass.findOneAndUpdate({ _id: classId }, { $set: update })
        } catch (e) {
          throw new ExError('failed to update class', {
            type: 'int',
            code: 'DB_UPDATE_CLASS',
            err: e,
            info: {
              userId: classId.toHexString(),
            },
          })
        }
      }

      // TODO: 이름이 업데이트됐다면, 팔로우에서 반이름 업데이트

      reply.send(ResOkValue)
    },
  })
}
