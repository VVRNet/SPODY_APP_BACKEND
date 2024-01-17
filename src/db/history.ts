import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

export let CollHistory: Collection<SchemaHistory>
export const InitCollHistory = () => {
  CollHistory = Database.collection<SchemaHistory>('history')
}

// 퀴즈 히스토리
export interface SchemaHistory {
  _id?: ObjectId // 내부id
  userId: ObjectId // 학생/반 id
  userType: 'std' | 'class' // 방장유저 종류 (학생/반)
  keywordId: ObjectId // 과목명 id
  categoryId?: ObjectId // 카테고리 id
  subjectId?: ObjectId // 과제 id
  gameId?: ObjectId // 게임 id
  gameCount?: number // 게임 회차
  gameMember?: { id: ObjectId; type: 'std' | 'class' }[] // 같이 플레이한 유저 id 목록
  rank?: number // 게임 등수
  quizId: ObjectId // 게임 id
  answerOrder: number[] // 출제 문제 순서
  answerTime: number[] // 답변 소요시간
  answerCorrect: boolean[] // 정답 여부
  ageLearn: number // 학습능력 나이
  ageCognative: number // 인지능력 나이
  ageActivity: number // 운동능력 나이
  recordAt: Date // 기록시간
}
