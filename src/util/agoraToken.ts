import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { ExError } from './error'

let appId: string | null = null
let appCert: string | null = null

export const AgoraInit = (id: string, cert: string) => {
  appId = id
  appCert = cert
}

export const AgoraGetTokenWithNewChannel = (
  userId: string,
): { channelName: string; token: string } => {
  const channelName = generateChannelName()
  return { channelName: channelName, token: generateToken(userId, channelName) }
}

export const AgoraGetToken = (userId: string, channelName: string): string =>
  generateToken(userId, channelName)

const generateToken = (userId: string, channelName: string): string => {
  if (appId == null || appCert == null) {
    throw new ExError('no app config for agora', {
      type: 'int',
      code: 'AGORA_CONFIG_NOTEXISTED',
    })
  }
  const tokenExpiredInSeconds = 3600
  const privilegeExpiredInSeconds = 3600
  return RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCert,
    channelName,
    userId,
    RtcRole.PUBLISHER,
    tokenExpiredInSeconds,
    privilegeExpiredInSeconds,
  )
}

const generateChannelName = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzZ0123456789'
  return [...Array(32)]
    .map(() => {
      const randomIndex = Math.floor(Math.random() * characters.length)
      return characters[randomIndex]
    })
    .join('')
}
