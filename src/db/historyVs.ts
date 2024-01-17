import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 유저간 전적방
export let CollHistoryVs: Collection<SchemaHistoryVs>
export const InitCollHistoryVs = () => {
  CollHistoryVs = Database.collection<SchemaHistoryVs>('historyVs')
}

export interface SchemaHistoryVsUser {
  id: ObjectId // 참가자 id
  type: 'std' | 'class' // 참가자 종류
  // name: string // 참가자 이름
  // orgName?: string // 참가자가 반일경우, 기관이름
  // imgUrl?: string // 이미지 url
  // country:string
}

export interface SchemaHistoryVs {
  _id?: ObjectId // 내부id
  from: SchemaHistoryVsUser
  to: SchemaHistoryVsUser
  win: number // 승리회수
  all: number // 패배회수
  lastGameId: ObjectId // 마지막으로 진행한 게임 id
  lastGameCount: number // 마지막으로 진행한 게임 회차
}
