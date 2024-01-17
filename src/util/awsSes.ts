import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { fromIni } from '@aws-sdk/credential-providers'
import { ExError } from './error'

let client: SESClient

export const AwsSesInit = (region: string, localProfileName: string | null) => {
  client = new SESClient(
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
export const AwsSesSendEmail = async (
  to: string,
  from: string,
  subject: string,
  body: string,
): Promise<void> => {
  try {
    await client.send(
      new SendEmailCommand({
        Destination: {
          ToAddresses: [to], // 수신자 이메일 주소
        },
        Message: {
          Body: {
            Html: {
              Data: body, // HTML 형식의 본문 내용
            },
          },
          Subject: {
            Data: subject, // 이메일 제목
          },
        },
        Source: from, // 발신자 이메일 주소
      }),
    )
  } catch (e) {
    throw new ExError('fail to send mail', {
      type: 'int',
      code: 'AWS_SES_SEND_ERROR',
      info: {
        to: to,
        from: from,
        subject: subject,
      },
      err: e,
    })
  }
}
