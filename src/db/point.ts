import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 과목용 언어별 키워드
export let CollPoint: Collection<SchemaPoint>
export const InitCollPoint = () => {
  CollPoint = Database.collection<SchemaPoint>('point')
}

export type PointUpdateType = '+gamePlay' | '+gameRank'

export interface SchemaPoint {
  _id?: ObjectId // 내부id
  userId: ObjectId // 유저id
  classId?: ObjectId // 기관이면 반의 id
  current: number // 현재포인트
  change: number // 변경량 (소비의 경우 음수값)
  type: PointUpdateType // +gamePlay:맞춘문제수, +gameRank:등수
  relatedId?: ObjectId // 관련 id (게임관련이면 히스토리id)
  quizId?: ObjectId // 퀴즈관련이라면 퀴즈id
  createAt: Date // 변경된날짜
}
