import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 검색명 정보. 빠른 검색과 unique 설정을 위해 별도 collection으로 뺌
export let CollUserFindId: Collection<SchemaUserFindId>
export const InitCollUserFindId = () => {
  CollUserFindId = Database.collection<SchemaUserFindId>('userFindId')
}

export interface SchemaUserFindId {
  _id?: ObjectId // 내부id
  name: string // 검색id 이름
  userId: ObjectId // 유저 id
  classId?: ObjectId // 기관일 경우, 반 id
}
