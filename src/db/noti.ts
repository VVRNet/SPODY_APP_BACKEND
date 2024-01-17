// import { Collection, ObjectId } from 'mongodb'
// import { Database } from './common'

// // 알림사항
// export let CollNoti: Collection<SchemaNoti>
// export const InitCollNoti = () => {
//   CollNoti = Database.collection<SchemaNoti>('noti')
// }

// export interface SchemaNoti {
//   _id?: ObjectId // 내부id
//   userId: ObjectId // 대상 유저 id
//   type: 'friendInvite' | 'friendAccept' | 'classInvite' | 'classAccept' | 'classLeave'
//   relatedId: ObjectId // 관련객체 id
//   createDate: Date // 생성일
// }
