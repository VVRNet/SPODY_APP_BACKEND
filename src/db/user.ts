import { Collection, ObjectId } from 'mongodb'
import { Database } from './common'

// 사용자
export let CollUser: Collection<SchemaUser>
export const InitCollUser = () => {
  CollUser = Database.collection<SchemaUser>('user')
}

export interface SchemaUserAgreement {
  service?: {
    version: number // 서비스 이용 약관 버전
    date: Date // 동의한 시간
  }
  privacy?: {
    version: number // 개인정보 보호방침
    date: Date // 동의한 시간
  }
  marketing?: {
    version: number // 마케팅 약관 버전
    date: Date // 동의한 시간
  }
}

export interface SchemaUser {
  // 가입시 정보
  _id?: ObjectId // 내부id
  email: string // 이메일
  password: string // 암호(암호화됨)
  agreement: SchemaUserAgreement // 동의한 약관 버전
  type: 'std' | 'org' // 유저종류 - 학생/기관
  joinDate: Date // 가입일
  signinDate: Date // 최근 로그인 일시
  deviceList: String[] // 푸시id
  lastNotiChecked: Date // 마지막 알림확인 일시

  // 추가 정보 - 공통
  name?: string // 이름
  imgUrl?: string // 프로필 이미지 url
  country?: string // 국가
  lang?: string // 언어

  // 추가 정보 - 학생
  birth?: Date // 생년월일
  gender?: 'male' | 'female' // 성별
  interest?: string[] // 관심사
  targetAge?: number // 목표연령

  // 추가 정보 - 기관
  // name: string    // 기관명
  postCode?: string // 우편번호
  address1?: string // 주소1
  address2?: string // 주소1
}
