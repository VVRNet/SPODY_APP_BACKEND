import { WebClient } from '@slack/web-api'
import { ExError } from './error'

const apiKey = 'xoxb-5518528823107-5624369814082-ElWWaUyseZJezJlrhWL3lqL3'
const web = new WebClient(apiKey)

const chanServerError = ''

export const SlackSendServerError = async (exErr: ExError) => {
  try {
    await web.chat.postMessage({
      text: `🚨 *서버 에러 발생* 🚨\n${Object.entries(exErr)
        .filter((e) => e[1] != null)
        .map((e) => `• *${e[0]}* : ${typeof e[1] === 'object' ? JSON.stringify(e[1]) : e[1]}`)
        .join('\n')}\n${exErr.stack?.toString()}`,
      channel: 'C05J9CD4GPP',
    })
  } catch (e) {
    new ExError('fail to send to slack', { type: 'int', code: 'SLACK_FAILED' })
  }
}

export const SlackSendMessage = async (message: string) => {
  try {
    await web.chat.postMessage({
      text: message,
      channel: 'C05J9CD4GPP',
    })
  } catch (e) {
    new ExError('fail to send to slack', { type: 'int', code: 'SLACK_FAILED' })
  }
}
