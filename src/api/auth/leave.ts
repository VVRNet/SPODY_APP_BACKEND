import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollClass } from '../../db/class'
import { DatabaseClient } from '../../db/common'
import { CollUser } from '../../db/user'
import { CollUserLeave } from '../../db/userLeave'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi, ResOk, ResOkType } from '../common'

const reqBody = Type.Object({
  reason: Type.String({ minLength: 1, description: '탈퇴사유' }),
})
type reqBodyType = Static<typeof reqBody>

export const ApiAuthLeave: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: url,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['인증'],
      summary: '탈퇴 요청',
      description: `[ 400에러 코드 ]
      
      . 없음
`,
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)

      const session = DatabaseClient.startSession()
      try {
        session.startTransaction({
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 1000,
        })

        // 유저 삭제
        const deleteResult = await CollUser.findOneAndDelete(
          {
            _id: userId,
          },
          { session: session },
        )

        const deletedUserInfo = deleteResult
        if (deletedUserInfo == null) {
          throw new Error('no users to delete')
        }

        // 삭제된 유저 목록에 추가
        await CollUserLeave.insertOne(
          {
            ...deletedUserInfo,
            leaveReason: request.body.reason,
          },
          { session: session },
        )

        // 기관이면, 소속반도 모두 삭제
        if (deletedUserInfo.type === 'org') {
          await CollClass.deleteMany({
            userId: userId,
          })

          // TODO: 소속관계 제거
          // TODO: 팔로우 관계 제거
          // TODO: 소속 학생들에게 알림 추가?
        } else {
          // TODO: 소속관계 제거
          // TODO: 팔로우 관계 제거
          // TODO: 소속 기관에게 알림 추가
        }

        // TODO: 친구관계 제거

        await session.commitTransaction()
        await session.endSession()
      } catch (e) {
        await session.abortTransaction()
        await session.endSession()
        throw new ExError('failed to delete user', {
          type: 'int',
          code: 'DB_INSERT_CLASS',
          err: e,
        })
      }
    },
  })
}
