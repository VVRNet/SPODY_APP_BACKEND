import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 키워드 카테고리
export let CollCategory: Collection<SchemaCategory>
export const InitCollCategory = () => {
  CollCategory = Database.collection<SchemaCategory>('category')
}

export interface SchemaCategory {
  _id?: ObjectId // 내부id
  trans: { language: string; word: string }[] // 언어코드 별 단어
}
