import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 퀴즈 문제 모음
export let CollQuiz: Collection<SchemaQuiz>
export const InitCollQuiz = () => {
  CollQuiz = Database.collection<SchemaQuiz>('quiz')
}

export interface SchemaQuizQuestion {
  question: { language: string; text: string }[] // 질문
  choice: { language: string; text: string[] }[] // 선택지
  imageUrl?: string[] // 선택지 별 이미지
  answer: number // 정답
  tryCount: number // 풀이회수
  correctCount: number // 맞춘회수
}

export interface SchemaQuiz {
  _id?: ObjectId // 내부id
  keywordId: ObjectId // 과목명
  categoryId?: ObjectId // 카테고리
  age: number // 대상나이
  gender: 'male' | 'female' // 대상성별
  question: SchemaQuizQuestion[] // 개별 문제들
  creator: ObjectId // 만든이 id
  creatorType: 'std' | 'class' // 만든이 종류
  createDate: Date // 만든날짜
  level: number // 난이도 1~5
  ratingCount: number // 평가회수
  rating: number // 평가
  isSearchable?: boolean // 검색노출 검수 완료여부
  statCount: number // 풀이 회수
  statAvgAgeLearn: number // 평균 학습능력 나이
  statAvgAgeCognative: number // 평균 인지능력 나이
  statAvgAgeActivity: number // 평균 운동능력 나이
}
