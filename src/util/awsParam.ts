import { GetParameterCommand, GetParameterCommandOutput, SSMClient } from '@aws-sdk/client-ssm'
import { fromIni } from '@aws-sdk/credential-providers'
import { ExError } from './error'

let client: SSMClient

export const AwsParamInit = (region: string, localProfileName: string | null) => {
  client = new SSMClient(
    localProfileName == null
      ? { region: region }
      : { region: region, credentials: fromIni({ profile: localProfileName }) },
  )
}

/**
 * Aws ParameterStore 가져오기
 * @param {string} name Param 이름
 * @returns {ResultTuple<string>} 튜플 - Param 내용 / 에러
 */
export const AwsParamGet = async (name: string): Promise<string> => {
  let res: GetParameterCommandOutput
  try {
    res = await client.send(
      new GetParameterCommand({
        Name: name,
        WithDecryption: true,
      }),
    )
  } catch (e) {
    throw new ExError('fail to get param', {
      type: 'int',
      code: 'AWS_PARAM_GET_ERROR',
      info: {
        keyName: name,
      },
      err: e,
    })
  }
  if (res.Parameter?.Value == null) {
    throw new ExError('param not exited mail', {
      type: 'int',
      code: 'AWS_PARAM_GET_NOTFOUND',
      info: {
        keyName: name,
      },
    })
  }
  return res.Parameter.Value
}
