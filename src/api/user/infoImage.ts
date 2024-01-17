import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance } from 'fastify'
import { CollUser } from '../../db/user'
import { AwsS3PutObject } from '../../util/awsS3'
import { Env } from '../../util/env'
import { ExError } from '../../util/error'
import { ApiRoleCheckers, JwtAuthHeader } from '../authHandler'
import { CtxUserId, RegisterApi, ResOk, ResOkType, ResOkValue } from '../common'

// 파일 업로드에 대한 스키마 정의
const reqBodyFile = Type.Object({
  // encoding: Type.String(),
  filename: Type.String(),
  // mimetype: Type.String(),
  data: Type.Any(), // Buffer
  // type: Type.Optional(Type.String()),
})
const reqBody = Type.Object({
  uploadImage: Type.Optional(
    Type.Array(reqBodyFile, {
      maxItems: 1,
      description:
        '업로드할 이미지 파일 업로드. 해당 필드가 없다면 기존 프로필 이미지를 삭제. swagger로는 테스트 불가.',
    }),
  ),
})
type reqBodyType = Static<typeof reqBody>

export const ApiUserInfoImage: RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
): void => {
  app.route<{ Body: reqBodyType; Reply: ResOkType }>({
    method: 'post',
    url: `${url}`,
    preHandler: apiRole != null ? ApiRoleCheckers[apiRole] : undefined,

    // API schema ====================================================
    schema: {
      tags: ['유저'],
      summary: '유저 프로파일 이미지 업데이트.',
      headers: apiRole != null ? JwtAuthHeader : {},
      body: reqBody,
      response: {
        200: ResOk,
      },
    },

    // API handler ====================================================
    handler: async (request, reply) => {
      const userId = CtxUserId(request)
      const upload = request.body.uploadImage?.[0]

      // 이미지 업로드 처리
      let filename: string | undefined = undefined
      if (upload != null) {
        filename = `${userId.toHexString()}_${new Date().getTime()}.${upload.filename.substring(
          upload.filename.lastIndexOf('.') + 1,
          upload.filename.length,
        )}`
        await AwsS3PutObject(
          `${Env().env === 'prd' ? 'prd' : 'dev'}-spody-images`,
          `profile/${filename}`,
          upload.data,
        )
      }

      // 프로필이미지 정보 변경
      try {
        await CollUser.findOneAndUpdate(
          { _id: CtxUserId(request) },
          {
            $set: {
              imgUrl:
                filename == null
                  ? undefined
                  : `https://${
                      Env().env === 'prd' ? '' : 'dev-'
                    }image.z-meal.com/profile/${filename}`,
            },
          },
        )
      } catch (e) {
        throw new ExError('failed to update user', {
          type: 'int',
          code: 'DB_UPDATE_USER',
          err: e,
          info: {
            userId: userId.toHexString(),
          },
        })
      }

      // TODO: 기존파일 삭제

      // API 응답
      reply.send(ResOkValue)
    },
  })
}
