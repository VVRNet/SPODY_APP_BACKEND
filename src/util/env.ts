import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { AwsParamGet, AwsParamInit } from './awsParam'
import { AwsS3Init } from './awsS3'
import { AwsSesInit } from './awsSes'
import { EnvType } from './env.type'
import { ExError } from './error'

export let env: EnvType

export const Env = (): Readonly<EnvType> => env
export const EnvIsLocal = (): boolean => env.env === 'local'
export const EnvIsPrd = (): boolean => env.env === 'prd'
export const EnvIsNonPrd = (): boolean => ['local', 'dev', 'stg'].includes(env.env ?? '')
export const EnvInit = async (): Promise<void> => {
  // 환경변수 체크
  // const envEnv = process.env.ENV
  // const envVersion = process.env.VERSION
  // const envRegion = process.env.REGION
  const envEnv = 'local';
  const envVersion = '0';
  const envRegion = 'ap-northeast-2';
  if (envEnv == null || envRegion == null || envVersion == null) {
    const msg = `BOOTSTRAP FAIL - env values empty - ENV : ${envEnv} / REGION : ${envRegion} / VERSION : ${envVersion}`
    throw new ExError(msg, {
      type: 'int',
      code: 'INIT_ENV_NOT_EXITED',
      info: {
        env: envEnv,
        region: envRegion,
        version: envVersion,
      },
    })
  }

  let localProfileName: string | null = null
  if (envEnv === 'local') {
    // local 환경이면 aws cli profile 이름 세팅
    // if (process.env.AWS_PROFILE == null) {
    //   throw new ExError(`BOOTSTRAP FAIL - with local env, AWS_PROFILE env not existed ${process.env.AWS_PROFILE}`, {
    //     type: 'int',
    //     code: 'INIT_ENV_NOT_EXITED',
    //   })
    // }
    // localProfileName = process.env.AWS_PROFILE
    localProfileName = 'spody';
  }

  AwsParamInit(envRegion, localProfileName)
  const awsParam = await AwsParamGet(`${envEnv === 'local' ? 'dev' : envEnv}-api-param`)
  env = plainToInstance(EnvType, JSON.parse(awsParam ?? '{}') as object)
  env.env = envEnv as 'local' | 'dev' | 'prd'
  env.region = envRegion
  env.version = envVersion
  AwsS3Init(env.region, localProfileName)
  AwsSesInit(env.region, localProfileName)

  // env 객체 검증
  const envValidationError = validateSync(env)
  if (envValidationError.length > 0) {
    const msg = 'BOOTSTRAP FAIL - validate env'
    console.log(msg)
    console.log(`--- env is..`)
    console.log(env)
    console.log(`--- validation error is..`)
    console.log(envValidationError.join('\n'))
    throw new ExError(msg, {
      type: 'int',
      code: 'INIT_ENV_VALIDATION',
      info: {
        validationErrors: envValidationError,
      },
    })
  }

  // UtilInit({
  //     slackApikey: env.slackApiKey,
  //     jwtSecret: env.jwtInfos,
  // })
}
