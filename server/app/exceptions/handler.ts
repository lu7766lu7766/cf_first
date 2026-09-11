import { HttpExceptionHandler } from '../../core/exception_handler'
import type { HttpContext } from '../../core/types'

export class AppExceptionHandler extends HttpExceptionHandler {
  async handle(error: unknown, ctx: HttpContext): Promise<Response> {
    // 呼叫基底類別處理標準例外（ValidationException, HttpException 等）
    return super.handle(error, ctx)
  }

  async report(error: unknown, _ctx: HttpContext): Promise<void> {
    // 可在此處對接 Sentry 或 Cloudflare 日誌服務
    console.error('[AppExceptionHandler]:', (error as Error)?.message || error)
  }
}
