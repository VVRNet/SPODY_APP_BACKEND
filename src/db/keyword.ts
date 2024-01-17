import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 과목용 언어별 키워드
export let CollKeyword: Collection<SchemaKeyword>
export const InitCollKeyword = () => {
  CollKeyword = Database.collection<SchemaKeyword>('keyword')
}

export interface SchemaKeyword {
  _id?: ObjectId // 내부id
  trans: { language: string; word: string }[] // 언어코드 별 단어
  category?: ObjectId[]
}

// 쿼리 : db.survey.find({ results: { $elemMatch: { product: "xyz", score: { $gte: 8 } } } });
// 인덱스 : db.survey.createIndex({ "results.product": 1, "results.score": 1 });
