import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 기관사용자 내 반 프로필
export let CollClass: Collection<SchemaClass>
export const InitCollClass = () => {
  CollClass = Database.collection<SchemaClass>('class')
}

export interface SchemaClass {
  _id?: ObjectId // 내부id
  name: string // 반이름
  interest?: string[] // 관심사
  userId: ObjectId // 기관 유저id
  createDate: Date // 생성일
}
