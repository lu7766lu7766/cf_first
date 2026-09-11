import app from './index'

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
    assert(res.status === 200 && data.status === 'online', '1. 健康檢查 GET /api/health')
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
    userToken = data.token
    assert(res.status === 201 && !!data.token, '2. 註冊帳號 POST /api/auth/register (回傳 JWT Token)')
  }

  // 3. POST /api/auth/login
  {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test_user@example.com',
        password: 'securePassword123'
      })
    })
    const data = await res.json<any>()
    assert(res.status === 200 && !!data.token, '3. 登入取得 Token POST /api/auth/login')
  }

  // 4. GET /api/auth/me (Auth Guard 401 & 200)
  {
    // 未攜帶 Token 應回傳 401
    const resUnauthorized = await app.request('/api/auth/me')
    assert(resUnauthorized.status === 401, '4a. Auth Guard 攔截未授權存取 (401 Unauthorized)')

    // 攜帶 Token 應成功回傳 200
    const resAuthorized = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${userToken}` }
    })
    const data = await resAuthorized.json<any>()
    assert(resAuthorized.status === 200 && data.user.email === 'test_user@example.com', '4b. Auth Guard 驗證通過 GET /api/auth/me')
  }

  // 5. GET /api/notes (Model Query)
  {
    const res = await app.request('/api/notes')
    const data = await res.json<any>()
    assert(res.status === 200 && Array.isArray(data.data), '5. 筆記清單查詢 GET /api/notes (Model Active Record)')
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
    assert(res.status === 422 && Array.isArray(data.errors), '6. VineJS Class Validator 欄位驗證攔截 (422 Unprocessable Entity)', data)
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
    createdNoteId = data.data.id
    assert(res.status === 201 && data.data.title === '自動化測試筆記', '7. 筆記新增 POST /api/notes')
  }

  // 8. GET /api/notes/:id 與 DELETE /api/notes/:id (Resource 路由)
  {
    const resShow = await app.request(`/api/notes/${createdNoteId}`)
    const dataShow = await resShow.json<any>()
    assert(resShow.status === 200 && dataShow.data.id === createdNoteId, `8a. Resource Show GET /api/notes/${createdNoteId}`)

    const resDel = await app.request(`/api/notes/${createdNoteId}`, { method: 'DELETE' })
    assert(resDel.status === 200, `8b. Resource Destroy DELETE /api/notes/${createdNoteId}`)
  }

  // 9. POST /api/notes/transaction-test (Database Transaction)
  {
    const res = await app.request('/api/notes/transaction-test', { method: 'POST' })
    const data = await res.json<any>()
    assert(res.status === 200 && data.success === true, '9. 資料庫事務 Database.transaction()')
  }

  // 10. GET /api/macro-test (Response Macro)
  {
    const res = await app.request('/api/macro-test')
    const data = await res.json<any>()
    assert(res.status === 200 && data.success === true && !!data.meta.framework, '10. 自訂 Response Macro 巨集測試')
  }

  // 11. GET /api/error-test (AppExceptionHandler 全域異常捕獲)
  {
    const res = await app.request('/api/error-test')
    const data = await res.json<any>()
    assert(res.status === 400 && data.code === 'E_SAMPLE_ERROR', '11. AppExceptionHandler 捕捉自訂 HttpException')
  }

  console.log(`\n測試總結: ${passed} 通過, ${failed} 失敗`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
