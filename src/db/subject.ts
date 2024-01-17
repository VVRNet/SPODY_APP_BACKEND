import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 과목
export let CollSubject: Collection<SchemaSubject>
export const InitCollSubject = () => {
  CollSubject = Database.collection<SchemaSubject>('subject')
}

export interface SchemaSubject {
  _id?: ObjectId // 내부id
  userType: 'std' | 'class' // 사용유저 종류 (학생/반)
  userId: ObjectId // 사용유저 id
  keywordId: ObjectId // 키워드 id
  categoryId?: ObjectId // 카테고리 id
  favorite: boolean
  startAge: number
  targetAge: number
  currentAge: number
  currentLevel: number
  keywordLanguage: string
  keyword: string
  createDate: Date
  tryCount: number
}
