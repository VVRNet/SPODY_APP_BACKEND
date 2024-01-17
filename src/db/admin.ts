import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 어드민
export let CollAdmin: Collection<SchemaAdmin>
export const InitCollAdmin = () => {
  CollAdmin = Database.collection<SchemaAdmin>('admin')
}

export interface SchemaAdmin {
  _id?: ObjectId // 내부id
  email: string // 이메일
  password: string // 암호(암호화됨)
  joinDate: Date // 등록일
}
