import { Collection } from 'mongodb'
import { Database } from './common'

// 이메일 인증 컨펌
export let CollEmailValidate: Collection<SchemaEmailValidate>
export const InitCollEmailValidate = () => {
  CollEmailValidate = Database.collection<SchemaEmailValidate>('emailValidate')
}
export interface SchemaEmailValidate {
  code: string // 인증코드
  expireAt: Date // 문서 만료시간 (= 인증만료 시간)
  email: string // 이메일
  status: 'ready' | 'confirm' // 대기중 / 인증완료
  type: 'signup' | 'password' // 가입 / 비밀번호 찾기
}
