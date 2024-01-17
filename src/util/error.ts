import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

/**
 * 에러 리턴 형식. ExError생성을 위한 정보들이 있음
 * @type {ExErrorParam}
 * @property {string} type 내부에러/외부에러 여부
 * @property {string} code 에러 코드
 * @property {Record<string, any>} info 추가 에러 정보들
 * @property {error?} error error 객체. 없을시 생성해서 넣을것
 */
export class ExErrorParam {
  type: 'int' | 'ext'
  code: string
  info?: Record<string, any>
  err?: any
}

export class ExError extends Error {
  static isExError = (e: any): e is ExError => {
    return ['int', 'ext'].includes(e.type ?? null) && e.code != null
  }

  @IsIn(['int', 'ext'])
  type: 'int' | 'ext'

  @IsNotEmpty()
  @IsString()
  code: string

  @IsOptional()
  @IsString()
  originMessage?: string

  @IsOptional()
  @IsObject()
  info?: Record<string, any>

  constructor(msg: string, errParam: ExErrorParam) {
    super(msg)
    Object.setPrototypeOf(this, ExError.prototype)
    if (errParam.err?.name != null) {
      this.name = errParam.err.name
    }
    if (errParam.err?.message != null) {
      this.originMessage = errParam.err.message
    }
    if (errParam.err?.stack != null) {
      this.stack = errParam.err.stack
    }
    // if (this.stack == null) {
    //   try {
    //     throw new Error()
    //   } catch (e: any) {
    //     this.stack = e.stack
    //   }
    // }
    this.type = errParam.type
    this.code = errParam.code
    this.info = errParam.info
    if (this.type !== 'ext') {
      console.log(
        JSON.stringify(Object.assign({ level: 'exception', stack: this.stack?.toString() }, this)),
      )
    }
  }
}
