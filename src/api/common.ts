import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ObjectId } from 'mongodb'
import { ExError } from '../util/error'
import { ApiRoleCheckers } from './authHandler'

// api 등록 함수
export type PreHookHandler = (request: FastifyRequest, _reply: FastifyReply) => Promise<void>
export type RegisterApi = (
  app: FastifyInstance,
  url: string,
  apiRole?: keyof typeof ApiRoleCheckers,
) => void

// 단순 정상 완료 응답
export const ResOk = Type.Object({
  result: Type.String({ examples: ['ok'] }),
})
export type ResOkType = Static<typeof ResOk>
export const ResOkValue: ResOkType = { result: 'ok' }

// jwt 응답
export const ResJwt = Type.Object({
  access: Type.String({ description: 'access 토큰', examples: ['eyJhbGciOi...'] }),
  refresh: Type.String({ description: 'refresh 토큰', examples: ['eyJhbGciOi...'] }),
})
export type ResJwtType = Static<typeof ResJwt>

// 이메일 인증관련
export const EmailSender = 'sender@z-meal.com'
export const EmailCodeLiveTimeMinReady = 11
export const EmailCodeLiveTimeMinConfirm = 61
export const EmailValidationCodeLenth = 6
export const EmailValidationCodeGenerate = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return [...Array(EmailValidationCodeLenth)]
    .map(() => {
      const randomIndex = Math.floor(Math.random() * characters.length)
      return characters[randomIndex]
    })
    .join('')
}

// 유저 암호 관련
export const PasswordMinLength = 4

// 유저 컨텍스트
export const CtxUserId = (request: FastifyRequest) => {
  const userId = request.requestContext.get('userId')
  if (userId == null) {
    throw new ExError('failed to get reqContext - userId', {
      type: 'int',
      code: 'JWT_GET_CONTEXT',
    })
  }
  return StrToObjectId(userId, 'USERID')
}
export const CtxUserType = (request: FastifyRequest) => {
  const userType = request.requestContext.get('userType')
  if (userType == null) {
    throw new ExError('failed to get reqContext - userType', {
      type: 'int',
      code: 'JWT_GET_CONTEXT',
    })
  }
  return userType
}

// ObjectId 변환
export const StrToObjectId = (objectIdStr: string, errObject: string) => {
  try {
    return new ObjectId(objectIdStr)
  } catch (e) {
    throw new ExError('wrong class id', {
      type: 'ext',
      code: `${errObject}_WRONG_ID`,
      err: e,
    })
  }
}
