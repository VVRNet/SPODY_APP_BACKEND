import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 퀴즈방
export let CollGame: Collection<SchemaGame>
export const InitCollGame = () => {
  CollGame = Database.collection<SchemaGame>('game')
}

// 퀴즈 멤버
export interface SchemaGameMember {
  id: ObjectId // 참가자 id
  type: 'std' | 'class' // 참가자 종류
  name: string // 참가자 이름
  orgName?: string // 참가자가 반일경우, 기관이름
  imgUrl?: string // 프로필 이미지 url
  country?: string // 국가
  status: 'inviting' | 'join' | 'ready' | 'play' // | 'done'
}

// 퀴즈 방장
export type SchemaGameHost = Omit<SchemaGameMember, 'status'> & {
  role: 'play' | 'watch'
  playing: boolean
}

// 퀴즈 정보
export interface SchemaGame {
  _id?: ObjectId // 내부id
  quizId?: ObjectId // 퀴즈 id
  agoraChannel: string
  host: SchemaGameHost
  count: number // 게임회수
  members: SchemaGameMember[]
}
