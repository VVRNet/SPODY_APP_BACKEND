import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 게임중 웹소켓 연결 끊긴 유저
export let CollDisconnUser: Collection<SchemaDisconnUser>
export const InitCollDisconnUser = () => {
  CollDisconnUser = Database.collection<SchemaDisconnUser>('disconnUser')
}

export interface SchemaDisconnUser {
  _id?: ObjectId // 내부id
  userId: ObjectId // 참가자 id
  userType: 'std' | 'class' // 참가자 종류
  gameId: ObjectId // 참가했던 게임 id
  disconnAt: Date // 연결이 끊긴 시간
}
