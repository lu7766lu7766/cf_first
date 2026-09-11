import { kernel, server } from '../core/kernel'
import { router } from '../core/router'
import { ResponseMacro } from '../core/macro'
import { AppExceptionHandler } from '../app/exceptions/handler'
import ApiFormatMiddleware from '../app/middleware/api_format_middleware'

/**
 * 1. 註冊伺服器級 / 全域中介層 (Global Middleware Stack)
 * 這些中介層會在每一個 HTTP 請求的執行管線中最優先執行
 */
kernel.global([
  // 全域統一 API 格式化中介層 (code: [0], data, time)
  ApiFormatMiddleware,
])

/**
 * 2. 註冊具名中介層 (Named Middleware Collection)
 * 供路由或群組透過 `middleware.xxx()` 或字串名稱 (如 'auth', 'auth:jwt', 'apiFormat') 調用
 */
export const middleware = kernel.named({
  auth: () => import('../app/middleware/auth_middleware'),
  apiFormat: () => import('../app/middleware/api_format_middleware'),
})

/**
 * 3. 內核啟動初始化 (註冊全域例外處理器與 Macro 巨集)
 */
export function bootstrapKernel() {
  // 註冊全域例外處理器
  router.setExceptionHandler(new AppExceptionHandler())

  // 註冊 AdonisJS 風格之 Response Macro 巨集
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
