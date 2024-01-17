// import { Collection, ObjectId } from 'mongodb'
// import { Database } from './common'

// // 사용자
// export let CollRelationFriend: Collection<SchemaRelationFriend>
// export const InitCollRelationClass = () => {
//   CollRelationFriend = Database.collection<SchemaRelationFriend>('relationClass')
// }

// export interface SchemaRelationFriend {
//   _id?: ObjectId // 내부id
//   fromUserId: ObjectId // 초대한 친구/반 id
//   fromUserName: String // 초대한 친구/반 이름
//   fromUserNameOrg: String // 초대한 기관이름(기관일 경우)
//   toUserId: ObjectId // 초대받은 친구/반 id
//   toUserName: String // 초대받은 친구/반 이름
//   toUserNameOrg: String // 초대받은 기관이름(기관일 경우)
//   type: 'std' | 'class' // 친구 종류
//   status: 'invite' | 'reject' | 'ok' | 'deny' // 상태 - 초대, 거절, 완료, 삭제
//   createDate: Date // 생성일
//   updateDate: Date // 수정일
// }
