import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * Jwt 종류 type
 */
export type JwtType = 'access' | 'refresh'

/**
 * Jwt 키쌍 전달 type
 */
export type JwtPair = { access: string; refresh: string }

/**
 * Jwt 생성 응답 type
 */
export type JwtPairWithExpires = Record<
  'access' | 'refresh',
  {
    token: string
    expires: Date
  }
>

/**
 * Jwt Payload 축약 type
 */
export class JwtPayload {
  @IsNotEmpty()
  @IsString()
  userId: string

  @IsIn(['std', 'org', 'admin'])
  @IsString()
  type: 'std' | 'org' | 'admin'
}
