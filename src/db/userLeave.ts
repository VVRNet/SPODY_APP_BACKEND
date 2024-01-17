import { Collection } from 'mongodb'
import { Database } from './common'
import { SchemaUser } from './user'

// 사용자
export let CollUserLeave: Collection<SchemaUserLeave>
export const InitCollUserLeave = () => {
  CollUserLeave = Database.collection<SchemaUserLeave>('userLeave')
}

export interface SchemaUserLeave extends SchemaUser {
  leaveReason: string // 탈퇴사유
}
