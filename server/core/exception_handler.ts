import type { HttpContext } from './types'

export class HttpException extends Error {
  public status: number
  public code?: string
  public details?: any

  constructor(message: string, status = 500, code?: string, details?: any) {
    super(message)
    this.name = 'HttpException'
    this.status = status
    this.code = code
    this.details = details
  }
}

export class ValidationException extends HttpException {
  public errors: Array<{ field: string; message: string; rule?: string }>

  constructor(errors: Array<{ field: string; message: string; rule?: string }>) {
    super('Validation failed', 422, 'E_VALIDATION_ERROR', errors)
    this.name = 'ValidationException'
    this.errors = errors
  }
}

export class AuthenticationException extends HttpException {
  constructor(message = 'Unauthorized access', code = 'E_UNAUTHORIZED_ACCESS') {
    super(message, 401, code)
    this.name = 'AuthenticationException'
  }
}

export class HttpExceptionHandler {
  /**
   * 將例外轉換為 HTTP Response
   */
  async handle(error: unknown, ctx: HttpContext): Promise<Response> {
    if (error instanceof ValidationException) {
      return ctx.response.status(422).json({
        errors: error.errors,
        code: error.code
      })
    }

    if (error instanceof HttpException) {
      return ctx.response.status(error.status).json({
        message: error.message,
        code: error.code || 'E_HTTP_EXCEPTION',
        status: error.status,
        details: error.details
      })
    }

    const err = error as Error
    console.error('[HttpExceptionHandler] 未捕獲的伺服器例外：', err)

    return ctx.response.status(500).json({
      message: err.message || '內部伺服器錯誤 (Internal Server Error)',
      code: 'E_INTERNAL_SERVER_ERROR',
      status: 500
    })
  }

  /**
   * 記錄或上報例外
   */
  async report(error: unknown, _ctx: HttpContext): Promise<void> {
    console.error('[Reported Error]:', error)
  }
}
