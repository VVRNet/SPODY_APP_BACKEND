import { Collection } from 'mongodb'
import { Database } from './common'

// 약관정보
export let CollAgreement: Collection<SchemaAgreement>
export const InitCollAgreement = () => {
  CollAgreement = Database.collection<SchemaAgreement>('agreement')
}
export interface SchemaAgreement {
  type: 'privacy' | 'service' | 'marketing' // 약관 종류
  version: number // 버전
  title: string // 제목
  content: string // 내용
  isRequired: boolean // 필수 여부
  language: string // 언어
}
