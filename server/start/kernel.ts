import { ResponseMacro } from '../core/macro'
import { router } from '../core/router'
import { AppExceptionHandler } from '../app/exceptions/handler'

export function bootstrapKernel() {
  // 1. 註冊全域例外處理器
  router.setExceptionHandler(new AppExceptionHandler())

  // 2. 註冊 AdonisJS 風格之 Response Macro 巨集
  ResponseMacro.macro('apiSuccess', function (this: any, data: any, message = '操作成功') {
    return (this as any).json({
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        framework: 'AdonisJS 7 style on Hono Edge'
      }
    })
  })
}
