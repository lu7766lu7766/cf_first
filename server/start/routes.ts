import { router } from '../core/router'
import { auth } from '../app/middleware/auth_middleware'
import { HttpException } from '../core/exception_handler'
import AuthController from '../app/controllers/auth_controller'
import NotesController from '../app/controllers/notes_controller'

// 1. 健康檢查路由
router.get('/api/health', (ctx) => {
  return ctx.response.json({
    status: 'online',
    framework: 'Hono + AdonisJS 7 API architecture',
    runtime: 'Cloudflare Workers (Edge)',
    serverTime: new Date().toISOString()
  })
})

// 2. 身分驗證路由
router.post('/api/auth/register', [AuthController, 'register'])
router.post('/api/auth/login', [AuthController, 'login'])
router.get('/api/auth/me', [AuthController, 'me']).use([auth('jwt')])

// 3. 資料庫 Transaction 測試路由
router.post('/api/notes/transaction-test', [NotesController, 'transactionTest'])

// 4. Notes 資源路由 (AdonisJS 7 resource: 包含 index, store, show, update, destroy)
router.resource('/api/notes', NotesController)

// 5. Response Macro 測試路由
router.get('/api/macro-test', (ctx) => {
  return ctx.response.apiSuccess({ feature: 'Response Macro' }, '恭喜！成功呼叫自訂 Response Macro 巨集')
})

// 6. 全域 Exception Handler 攔截測試路由
router.get('/api/error-test', () => {
  throw new HttpException('這是由 AppExceptionHandler 全域捕捉並格式化的自訂異常', 400, 'E_SAMPLE_ERROR')
})
