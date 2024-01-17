import { Static, Type } from '@fastify/type-provider-typebox'
import { FastifyReply, FastifyRequest } from 'fastify'
import { ExError } from '../util/error'
import { JwtAccessVerify } from '../util/jwt'

export const JwtAuthHeader = Type.Object({
  authorization: Type.String({ minLength: 1, description: 'jwt access 토큰' }),
})
export type JwtAuthHeaderType = Static<typeof JwtAuthHeader>

export const ApiRoleCheckers = {
  USER: async (request: FastifyRequest, _reply: FastifyReply) => {
    await checkApiRole(request, 'user')
  },
  STD: async (request: FastifyRequest, _reply: FastifyReply) => {
    await checkApiRole(request, 'std')
  },
  ORG: async (request: FastifyRequest, _reply: FastifyReply) => {
    await checkApiRole(request, 'org')
  },
  ADMIN: async (request: FastifyRequest, _reply: FastifyReply) => {
    await checkApiRole(request, 'admin')
  },
  ANY: async (request: FastifyRequest, _reply: FastifyReply) => {
    await checkApiRole(request, 'any')
  },
}

const checkApiRole = async (
  request: FastifyRequest,
  role: 'user' | 'std' | 'org' | 'admin' | 'any',
) => {
  const jwt = request.headers.authorization
  if (jwt == null) {
    throw new ExError('jwt header not found', {
      type: 'ext',
      code: 'JWT_FAILED',
    })
  }
  const jwtPayload = await JwtAccessVerify(jwt)

  if (role !== 'any') {
    if (
      (role === 'admin' && jwtPayload.type !== 'admin') ||
      (role === 'org' && jwtPayload.type !== 'org') ||
      (role === 'std' && jwtPayload.type !== 'std') ||
      (role === 'user' && jwtPayload.type == 'admin')
    ) {
      throw new ExError('user no permission for api', {
        type: 'ext',
        code: 'API_PERMISSION',
      })
    }
  }

  request.requestContext.set('userId', jwtPayload.userId)
  request.requestContext.set('userType', jwtPayload.type)
}
