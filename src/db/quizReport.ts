import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 퀴즈 오류보고
export let CollQuizReport: Collection<SchemaQuizReport>
export const InitCollQuizReport = () => {
  CollQuizReport = Database.collection<SchemaQuizReport>('quizReport')
}
export interface SchemaQuizReport {
  userId: ObjectId
  userType: 'std' | 'class'
  quizId: ObjectId
  gameId?: ObjectId
  gameCount?: number
  pos: number
  content: string
  createdAt: Date
}
