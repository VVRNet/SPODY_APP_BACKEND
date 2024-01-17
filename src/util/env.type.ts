import { Type } from 'class-transformer'
import { IsIn, IsNotEmpty, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator'

export class JwtInfo {
  @IsNotEmpty()
  @IsString()
  key: string
  @IsPositive()
  ttlHours: number
}

export class JwtInfos {
  @ValidateNested()
  @Type(() => JwtInfo)
  access: JwtInfo
  @ValidateNested()
  @Type(() => JwtInfo)
  refresh: JwtInfo
}

export class DbInfo {
  @IsNotEmpty()
  @IsString()
  host: string

  @IsNotEmpty()
  @IsString()
  database: string

  @IsOptional()
  @IsString()
  id?: string

  @IsOptional()
  @IsString()
  pw?: string
}

export class EnvType {
  // OS 환경변수
  @IsNotEmpty()
  @IsString()
  region: string

  @IsNotEmpty()
  @IsString()
  version: string

  @IsIn(['local', 'dev', 'prd'])
  @IsString()
  env: 'local' | 'dev' | 'prd'

  // 추가 환경변수

  @IsOptional()
  @IsString()
  targetGroupArn: string

  @ValidateNested()
  @Type(() => DbInfo)
  dbInfo: DbInfo

  @ValidateNested()
  @Type(() => JwtInfos)
  jwtInfos: JwtInfos

  @IsNotEmpty()
  @IsString()
  gptApikey: string

  @IsNotEmpty()
  @IsString()
  agoraId: string

  @IsNotEmpty()
  @IsString()
  agoraCert: string
}
