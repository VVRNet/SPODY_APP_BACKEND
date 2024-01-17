import { instanceToPlain, plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import jwt from 'jsonwebtoken'
import { JwtInfos } from './env.type'
import { ExError } from './error'
import { JwtPair, JwtPairWithExpires, JwtPayload, JwtType } from './jwt.type'

let jwtSecret: Record<
  JwtType,
  {
    key: string
    ttlHours: number
  }
>

export const JwtInit = (jwtInfos: JwtInfos): void => {
  jwtSecret = {
    access: {
      key: jwtInfos.access.key,
      ttlHours: jwtInfos.access.ttlHours,
    },
    refresh: {
      key: jwtInfos.refresh.key,
      ttlHours: jwtInfos.refresh.ttlHours,
    },
  }
}

/**
 * Jwt Access/Refresh key 생성
 * @param {JwtPayload} payload jwt payload
 * @returns {ResultTuple<JwtPairWithExpires>} 생성된 jwt토큰 or ExError 정보
 */
export const JwtPairGenerate = (payload: JwtPayload): JwtPairWithExpires => {
  const now = new Date().getTime()
  const nowSec = Math.floor(now / 1000)
  const plainPlayload = instanceToPlain(payload)
  return {
    access: {
      token: jwtGenerate('access', plainPlayload, nowSec, jwtSecret.access.ttlHours * 3600),
      expires: new Date(now + jwtSecret.access.ttlHours * 3600000),
    },
    refresh: {
      token: jwtGenerate('refresh', plainPlayload, nowSec, jwtSecret.refresh.ttlHours * 3600),
      expires: new Date(now + jwtSecret.refresh.ttlHours * 3600000),
    },
  }
}

const jwtGenerate = (
  type: JwtType,
  payload: Record<string, any>,
  nowSec: number,
  ttlSec: number,
): string => {
  return jwt.sign(
    Object.assign(payload, { iat: nowSec, exp: nowSec + ttlSec }),
    jwtSecret[type].key,
    {
      algorithm: 'HS256',
    },
  )
}

/**
 * jwt 검증. 내부 payload 내용도 검증.
 * @param {JwtPair} tokens 검증할 access/refresh 키 쌍
 * @returns {ResultTuple<{ access: T; refresh: T }>} 성공시 decoding된 payload, 실패시 null
 */
export const JwtAccessVerify = async (token: string): Promise<JwtPayload> =>
  (await jwtVerify('access', token, true)).payload

const jwtVerify = async (
  type: JwtType,
  jwtToken: string,
  expireCheck: boolean,
): Promise<{ payload: JwtPayload; iat: number }> => {
  const [decoded, decodeError] = await jwtDecodePromise(type, jwtToken)
  if (
    typeof decoded === 'string' ||
    decoded?.iat == null ||
    (decodeError != null && decodeError?.name !== 'TokenExpiredError')
  ) {
    if (decodeError?.message === 'jwt signature is required') {
      throw new ExError('jwt verify failed', {
        type: 'int',
        code: 'JWT_VERIFY_ERROR',
        err: decodeError.inner,
      })
    } else {
      throw new ExError('jwt is wrong', {
        type: 'ext',
        code: 'JWT_VERIFY_WRONG',
        err: decodeError?.inner,
      })
    }
  }
  if (expireCheck && decodeError != null) {
    throw new ExError('jwt expired', {
      type: 'ext',
      code: 'JWT_VERIFY_EXPIRED',
      err: decodeError.inner,
    })
  }
  const payload = plainToInstance(JwtPayload, decoded)
  const errors = validateSync(payload)
  if (errors.length > 0) {
    throw new ExError('jwt body validation failed', {
      type: 'ext',
      code: 'JWT_VERIFY_WRONG',
      info: { validationError: errors, decoded: decoded },
    })
  }
  return { payload: payload, iat: decoded.iat }
}

const jwtDecodePromise = (type: JwtType, jwtToken: string) =>
  new Promise<[string | jwt.JwtPayload | undefined, jwt.VerifyErrors | null]>((resolve, _) => {
    jwt.verify(jwtToken, jwtSecret[type].key, function (err, decoded) {
      if (err instanceof jwt.TokenExpiredError) {
        resolve([jwt.decode(jwtToken) ?? undefined, err])
      }
      resolve([decoded, err])
    })
  })

/**
 * jwt 토큰 리프레시를 위한 페어 검증.
 * @param {JwtPair} tokens 검증할 access/refresh 키 쌍
 * @returns {ResultTuple<{ access: T; refresh: T }>} 성공시 각 key의 payload, 실패시 null
 */
export const JwtPairVerifyForRefresh = async (tokens: JwtPair): Promise<JwtPairWithExpires> => {
  const accessPayload = await jwtVerify('access', tokens.access, false)
  const refreshPayload = await jwtVerify('refresh', tokens.refresh, true)
  if (
    accessPayload.iat !== refreshPayload?.iat ||
    accessPayload.payload.userId !== accessPayload.payload.userId
  ) {
    throw new ExError('jwt pair not match', {
      type: 'ext',
      code: 'JWT_PAIR_NOT_MATCH',
    })
  }
  return JwtPairGenerate(accessPayload.payload)
}
