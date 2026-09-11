import app from './index'
import { kernel } from './core/kernel'
import { middleware } from './start/kernel'
import ApiFormatMiddleware from './app/middleware/api_format_middleware'
import { env } from './start/env'
import { dateTime, DateTime } from './core/time'
import { appConfig } from './config/app'
import { databaseConfig } from './config/database'
import { Note } from './app/models/note'
import { User } from './app/models/user'
import { createHttpContext } from './core/context'
import { AuthManager, JwtGuard } from './core/auth'

async function runTests() {
  console.log('🧪 開始執行 AdonisJS 7 API 功能自動化測試...\n')
  let passed = 0
  let failed = 0

  const assert = (condition: boolean, testName: string, detail?: any) => {
    if (condition) {
      console.log(`\x1b[32m✔ [PASS]\x1b[0m ${testName}`)
      passed++
    } else {
      console.error(`\x1b[31m✘ [FAIL]\x1b[0m ${testName}`, detail || '')
      failed++
    }
  }

  // 1. GET /api/health
  {
    const res = await app.request('/api/health')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      data.data.status === 'online' &&
      typeof data.time === 'string',
      '1. 健康檢查 GET /api/health'
    )
  }

  // 2. POST /api/auth/register
  let userToken = ''
  {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_user@example.com',
        password: 'securePassword123',
        fullName: '整合測試使用者'
      })
    })
    const data = await res.json<any>()
    userToken = data.data?.token
    assert(
      res.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      !!userToken,
      '2. 註冊帳號 POST /api/auth/register (回傳 JWT Token 與統一格式)'
    )
  }

  // 3. POST /api/auth/login (驗證 JWT 簽發與 RFC 7519 jti 唯一性)
  let loginToken1 = ''
  let loginToken2 = ''
  {
    const res1 = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_user@example.com',
        password: 'securePassword123'
      })
    })
    const data1 = await res1.json<any>()
    loginToken1 = data1.data?.token || ''

    // 再次登入，驗證即使同一帳號連續登入，每次也會因 jti (UUID) 簽發相異的唯一 Token
    const res2 = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_user@example.com',
        password: 'securePassword123'
      })
    })
    const data2 = await res2.json<any>()
    loginToken2 = data2.data?.token || ''

    const payload1 = JSON.parse(Buffer.from(loginToken1.split('.')[1], 'base64').toString())
    const payload2 = JSON.parse(Buffer.from(loginToken2.split('.')[1], 'base64').toString())

    assert(
      res1.status === 200 &&
      Array.isArray(data1.code) &&
      data1.code[0] === 0 &&
      !!loginToken1 &&
      !!loginToken2 &&
      loginToken1 !== loginToken2 &&
      typeof payload1.jti === 'string' &&
      typeof payload2.jti === 'string' &&
      payload1.jti !== payload2.jti,
      '3. 登入取得 Token POST /api/auth/login (驗證每次簽發唯一 jti 與相異 Token)'
    )
  }

  // 4. GET /api/auth/me (Auth Guard 401 & 200)
  {
    // 未攜帶 Token 應被攔截並以統一格式輸出異常
    const resUnauthorized = await app.request('/api/auth/me')
    const dataUnauth = await resUnauthorized.json<any>()
    assert(
      resUnauthorized.status === 200 &&
      (dataUnauth.status === 401 || dataUnauth.code === 'E_UNAUTHORIZED_ACCESS') &&
      typeof dataUnauth.time === 'string',
      '4a. Auth Guard 攔截未授權存取 (格式化 401 異常)'
    )

    // 攜帶 Token 應成功回傳 200
    const resAuthorized = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${userToken}` }
    })
    const data = await resAuthorized.json<any>()
    assert(
      resAuthorized.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      data.data?.user?.email === 'test_user@example.com',
      '4b. Auth Guard 驗證通過 GET /api/auth/me'
    )
  }

  // 4.1 GET /api/users (需要 JWT Auth)
  {
    // 未攜帶 Token 應被攔截 (401)
    const resUnauth = await app.request('/api/users')
    const dataUnauth = await resUnauth.json<any>()
    assert(
      resUnauth.status === 200 &&
      (dataUnauth.status === 401 || dataUnauth.code === 'E_UNAUTHORIZED_ACCESS'),
      '4.1a. GET /api/users 未提供 Token 攔截 (401 異常)'
    )

    // 攜帶 Token 應成功回傳使用者清單，且敏感欄位 (password) 自動排除
    const resAuth = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${userToken}` }
    })
    const dataAuth = await resAuth.json<any>()
    const users = Array.isArray(dataAuth.data) ? dataAuth.data : (dataAuth.data?.data || [])
    assert(
      resAuth.status === 200 &&
      Array.isArray(dataAuth.code) &&
      dataAuth.code[0] === 0 &&
      Array.isArray(users) &&
      users.length > 0 &&
      users[0].password === undefined,
      '4.1b. GET /api/users 授權存取成功取得使用者列表 (密碼自動排除)'
    )
  }

  // 5. GET /api/notes (Model Query with belongsTo user preloading)
  {
    const res = await app.request('/api/notes')
    const data = await res.json<any>()
    const notes = data.data?.data || []
    const firstNote = notes[0]
    assert(
      res.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      Array.isArray(notes) &&
      (!firstNote || (firstNote.user !== undefined && firstNote.user?.password === undefined)),
      '5. 筆記清單查詢 GET /api/notes (預載入 belongsTo user 且排除密碼)'
    )
  }

  // 6. POST /api/notes (Validation 422 攔截測試)
  {
    const res = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '短' // 長度小於 3 且缺乏 content
      })
    })
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      Array.isArray(data.errors) &&
      data.code === 'E_VALIDATION_ERROR' &&
      typeof data.time === 'string',
      '6. VineJS Class Validator 欄位驗證攔截 (422 格式化輸出)',
      data
    )
  }

  // 7. POST /api/notes (成功建立 Note)
  let createdNoteId = 0
  {
    const res = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '自動化測試筆記',
        content: '驗證 Hono + AdonisJS 7 完整運作'
      })
    })
    const data = await res.json<any>()
    createdNoteId = data.data?.data?.id
    assert(
      res.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      data.data?.data?.title === '自動化測試筆記',
      '7. 筆記新增 POST /api/notes'
    )
  }

  // 8. GET /api/notes/:id 與 DELETE /api/notes/:id (Resource 路由)
  {
    const resShow = await app.request(`/api/notes/${createdNoteId}`)
    const dataShow = await resShow.json<any>()
    assert(
      resShow.status === 200 &&
      dataShow.code[0] === 0 &&
      dataShow.data?.data?.id === createdNoteId,
      `8a. Resource Show GET /api/notes/${createdNoteId}`
    )

    const resDel = await app.request(`/api/notes/${createdNoteId}`, { method: 'DELETE' })
    const dataDel = await resDel.json<any>()
    assert(
      resDel.status === 200 &&
      dataDel.code[0] === 0,
      `8b. Resource Destroy DELETE /api/notes/${createdNoteId}`
    )
  }

  // 9. POST /api/notes/transaction-test (Database Transaction)
  {
    const res = await app.request('/api/notes/transaction-test', { method: 'POST' })
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code[0] === 0 &&
      data.data?.success === true,
      '9. 資料庫事務 Database.transaction()'
    )
  }

  // 10. GET /api/macro-test (Response Macro)
  {
    const res = await app.request('/api/macro-test')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code[0] === 0 &&
      data.data?.success === true &&
      !!data.data?.meta?.framework,
      '10. 自訂 Response Macro 巨集測試'
    )
  }

  // 11. GET /api/error-test (AppExceptionHandler 全域異常捕獲)
  {
    const res = await app.request('/api/error-test')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code === 'E_SAMPLE_ERROR' &&
      typeof data.time === 'string',
      '11. 全域異常格式化捕獲自訂 HttpException'
    )
  }

  // 12. POST /api/body-parser-test (AdonisJS BodyParser: body, qs, only, except)
  {
    const res = await app.request('/api/body-parser-test?source=test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AdonisBody', password: 'secret', extra: 123 })
    })
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code[0] === 0 &&
      data.data?.body?.name === 'AdonisBody' &&
      data.data?.qs?.source === 'test' &&
      data.data?.only?.name === 'AdonisBody' &&
      data.data?.only?.password === undefined &&
      data.data?.except?.password === undefined &&
      data.data?.except?.name === 'AdonisBody',
      '12. AdonisJS Body Parser (body, qs, only, except)'
    )
  }

  // 13. GET /api/format-test (ApiFormatMiddleware 格式整合)
  {
    const res = await app.request('/api/format-test')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      Array.isArray(data.code) &&
      data.code[0] === 0 &&
      data.data.message === '直接返回物件，由中介層格式化' &&
      typeof data.time === 'string' &&
      data.time.endsWith('ms'),
      '13. ApiFormatMiddleware 格式整合輸出 (code: [0], data, time)'
    )
  }

  // 14. HttpKernel Global & Named Middleware 驗證測試
  {
    const globals = kernel.getGlobalMiddlewares()
    const hasApiFormat = globals.some((m) => m === ApiFormatMiddleware || (m as any).name === 'ApiFormatMiddleware')
    assert(hasApiFormat, '14a. HttpKernel.global 全域中介層註冊與解析 (ApiFormatMiddleware)')

    const namedAuthHandler = middleware.auth('jwt')
    assert(typeof namedAuthHandler === 'function', '14b. HttpKernel.named 具名中介層工廠產生 (middleware.auth)')
  }

  // 15. Env 核心環境變數系統讀取與型別驗證
  {
    const appKey = env.get('APP_KEY')
    const timezone = env.get('APP_TIMEZONE')
    const dbConn = env.get('DB_CONNECTION')
    const port = env.get('PORT')

    assert(
      typeof appKey === 'string' && appKey.length > 0 &&
      timezone === 'Asia/Taipei' &&
      ['d1', 'sqlite', 'postgres', 'mysql'].includes(dbConn) &&
      typeof port === 'number' && port > 0,
      '15. Env 核心環境變數系統讀取與型別解析 (APP_KEY, APP_TIMEZONE, DB_CONNECTION, PORT)'
    )
  }

  // 16. Luxon TimeService 與 DateTime 時間物件實作
  {
    const now = dateTime.now()
    const formatted = dateTime.format(now, 'yyyy-MM-dd')
    const plusDays = now.plus({ days: 3 })
    const isLuxonInstance = now instanceof DateTime

    assert(
      isLuxonInstance &&
      now.zoneName === 'Asia/Taipei' &&
      formatted.length === 10 &&
      plusDays.diff(now, 'days').days >= 2.9,
      '16. Luxon TimeService 時間物件運算與時區綁定 (Asia/Taipei)'
    )
  }

  // 17. GET /api/env-info (環境變數設定檢驗路由)
  {
    const res = await app.request('/api/env-info')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code[0] === 0 &&
      data.data?.app?.timezone === 'Asia/Taipei' &&
      data.data?.app?.appKeyConfigured === true &&
      typeof data.data?.app?.appKeyMasked === 'string' &&
      data.data?.database?.defaultConnection === 'd1',
      '17. 環境變數檢驗路由 GET /api/env-info (時區、遮罩密鑰與 DB 資訊)'
    )
  }

  // 18. GET /api/time-test (Luxon 時間物件運算展示路由)
  {
    const res = await app.request('/api/time-test')
    const data = await res.json<any>()
    assert(
      res.status === 200 &&
      data.code[0] === 0 &&
      data.data?.now?.timezone === 'Asia/Taipei' &&
      typeof data.data?.calculations?.plusOneWeek === 'string' &&
      typeof data.data?.calculations?.inUtc === 'string' &&
      typeof data.data?.calculations?.inTokyo === 'string' &&
      typeof data.data?.calculations?.inNewYork === 'string',
      '18. Luxon 時間物件運算端點 GET /api/time-test (跨時區轉換與加減天數)'
    )
  }

  // 19. Model.query().preload('user') Thenable 測試
  {
    const notes = await Note.query().preload('user')
    const firstNote = notes[0]
    assert(
      Array.isArray(notes) &&
      notes.length > 0 &&
      firstNote instanceof Note &&
      firstNote.user instanceof User &&
      typeof firstNote.user?.email === 'string',
      '19. Note.query().preload("user") 直接 await (Thenable) 批次預載入且封裝為 Model 實例'
    )
  }

  // 20. Model.query().preload('user', callback) 子查詢篩選測試
  {
    const notes = await Note.query().preload('user', (query) => {
      query.select('id', 'email')
    })
    const firstNote = notes[0]
    assert(
      Array.isArray(notes) &&
      notes.length > 0 &&
      firstNote.user instanceof User &&
      firstNote.user.id !== undefined &&
      firstNote.user.email !== undefined,
      '20. Note.query().preload("user", callback) 支援 Query Callback 欄位挑選'
    )
  }

  // 21. model.load('user') Lazy Loading 測試
  {
    const note = await Note.find(1)
    if (note) {
      await note.load('user')
    }
    assert(
      note instanceof Note &&
      note.user instanceof User &&
      typeof note.user?.email === 'string',
      '21. note.load("user") Model 實體 Lazy Loading 關聯載入'
    )
  }

  // 22. Model.findOrFail 與 firstOrFail 異常拋出測試
  {
    const note = await Note.findOrFail(1)
    let caughtNotFound = false
    try {
      await Note.findOrFail(99999)
    } catch (err: any) {
      if (err.status === 404 && err.code === 'E_ROW_NOT_FOUND') {
        caughtNotFound = true
      }
    }
    assert(
      note instanceof Note &&
      note.id === 1 &&
      caughtNotFound,
      '22. Note.findOrFail(id) 成功取得實例，查無資料時拋出 404 (E_ROW_NOT_FOUND)'
    )
  }

  // 23. GET /api/notes/99999 (findOrFail 404 整合端點驗證)
  {
    const res = await app.request('/api/notes/99999')
    const data = await res.json<any>()
    assert(
      data.code === 'E_ROW_NOT_FOUND' &&
      data.status === 404 &&
      typeof data.message === 'string',
      '23. GET /api/notes/99999 經由 findOrFail 自動捕獲並返回格式化 E_ROW_NOT_FOUND'
    )
  }

  // 24. HttpContext.auth 強型別化與 AuthManager 實例驗證
  {
    const mockHonoContext = {
      req: {
        method: 'GET',
        url: 'http://localhost/test',
        header: () => undefined,
        param: () => ({}),
        query: () => ({}),
        raw: new Request('http://localhost/test')
      },
      env: {}
    } as any
    const ctx = createHttpContext(mockHonoContext)
    const isAuthManager = ctx.auth instanceof AuthManager
    const jwtGuard = ctx.auth.use('jwt')
    let caughtUnauth = false
    try {
      ctx.auth.getUserOrFail()
    } catch {
      caughtUnauth = true
    }
    ctx.auth.user = { id: 123, email: 'typed@example.com' }
    const user = ctx.auth.getUserOrFail()

    assert(
      isAuthManager &&
      jwtGuard instanceof JwtGuard &&
      caughtUnauth &&
      user.id === 123 &&
      user.email === 'typed@example.com',
      '24. HttpContext.auth 強型別化 (AuthManager, getUserOrFail, JwtGuard 實例)'
    )
  }

  console.log(`\n測試總結: ${passed} 通過, ${failed} 失敗`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
