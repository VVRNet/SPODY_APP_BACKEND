import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { Env } from './env'
import { ExError } from './error'
import { SlackSendServerError } from './slack'

export const ErrorHandlerFastify = async (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
) => {
  let exError: ExError
  if (ExError.isExError(error)) {
    // 처리 에러
    exError = error
  } else if (error.code === 'FST_ERR_VALIDATION') {
    exError = new ExError('request validation error', {
      type: 'ext',
      code: 'PARAM_VALIDATION',
      err: error,
      info: {
        validation: error.validation,
      },
    })
  } else {
    // 미처리 에러
    exError = new ExError('unknown internal error', {
      type: 'int',
      code: 'INTERNAL_UNKNOWN',
      err: error,
    })
  }
  if (Env().env != 'local' && exError.type !== 'ext') {
    await SlackSendServerError(exError)
  }
  const resBody: Record<string, any> = { code: exError.code }
  if (Env().env !== 'prd') {
    resBody.message = exError.message
    resBody.name = exError.name
    if (exError.originMessage != null) {
      resBody.originMessage = exError.originMessage
    }
    if (exError.stack != null) {
      resBody.stack = exError.stack
    }
    if (exError.info != null) {
      resBody.info = exError.info
    }
  }
  reply
    .status(exError.type === 'ext' ? (exError.code === 'JWT_VERIFY_EXPIRED' ? 401 : 400) : 500)
    .send(resBody)
}
