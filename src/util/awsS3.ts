import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { fromIni } from '@aws-sdk/credential-providers'
import { ExError } from './error'

let client: S3Client

export const AwsS3Init = (region: string, localProfileName: string | null) => {
  client = new S3Client(
    localProfileName == null
      ? { region: region }
      : { region: region, credentials: fromIni({ profile: localProfileName }) },
  )
}

/**
 * Aws S3 Object 저장하기
 * @param {string} bucket bucket 이름
 * @param {string} key object Key 경로
 * @param {string} body object 내용
 * @returns {ExErrorParam | null} 성공시 null, 실패시 에러 리턴
 */
export const AwsS3PutObject = async (bucket: string, key: string, body: Buffer): Promise<void> => {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      }),
    )
  } catch (e) {
    throw new ExError('fail to put obj', {
      type: 'int',
      code: 'AWS_S3_PUT_ERROR',
      info: {
        bucket: bucket,
        key: key,
      },
      err: e,
    })
  }
}
