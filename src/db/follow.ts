import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 팔로우
export let CollFollow: Collection<SchemaFollow>
export const InitCollFollow = () => {
  CollFollow = Database.collection<SchemaFollow>('follow')
}

export interface SchemaFollow {
  _id?: ObjectId // 내부id
  fromId: ObjectId // 팔로우하는 유저 id
  fromName: string // 팔로우하는 유저 이름
  fromOrgId?: ObjectId // 팔로우하는 기관 id(기관일 경우)
  fromOrgName?: string // 팔로우하는 기관 이름(기관일 경우)
  toId: ObjectId // 팔로우대상 친구/반 id
  toName: string // 팔로우대상 친구/반 이름
  toOrgId?: ObjectId // 팔로우대상 기관 id(기관일 경우)
  toOrgName?: string // 팔로우대상 기관 이름(기관일 경우)
  createDate?: Date // 생성일
}
