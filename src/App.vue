<script setup lang="ts">
import { ref, computed } from 'vue'

interface LogItem {
  time: string
  endpoint: string
  method: string
  status: number
  data: unknown
  isError?: boolean
}

const currentLog = ref<LogItem | null>(null)
const defaultMessage = '點擊上方 API 按鈕以發送測試請求，回應結果將即時呈現在下方 DevTools 控制台。'
const token = ref<string>('')
const loadingAction = ref<string | null>(null)
const isCopied = ref(false)

const authForm = ref({
  username: 'root',
  password: 'root'
})

const logResult = (name: string, method: string, status: number, data: unknown, isError = false) => {
  currentLog.value = {
    time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
    endpoint: name,
    method,
    status,
    data,
    isError: isError || status >= 400
  }
  console.group(`API 測試: ${method} ${name} (HTTP ${status})`)
  console.log('回應資料 (Data):', data)
  console.groupEnd()
}

// 語法高亮轉換
const highlightedContent = computed(() => {
  if (!currentLog.value) {
    return `<span class="text-comment">// ${defaultMessage}</span>`
  }

  const { time, endpoint, method, status, data, isError } = currentLog.value
  const statusColorClass = isError ? 'status-error' : 'status-success'
  const headerLine = `<span class="log-time">[${time}]</span> <span class="log-method ${method.toLowerCase()}">${method}</span> <span class="log-endpoint">${endpoint}</span> → <span class="log-status ${statusColorClass}">HTTP ${status}</span>\n\n`

  try {
    const rawJson = JSON.stringify(data, null, 2)
    const coloredJson = rawJson
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
        let cls = 'json-number'
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key'
          } else {
            cls = 'json-string'
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean'
        } else if (/null/.test(match)) {
          cls = 'json-null'
        }
        return `<span class="${cls}">${match}</span>`
      })

    return headerLine + coloredJson
  } catch {
    return headerLine + String(data)
  }
})

// 複製到剪貼簿
const copyOutput = async () => {
  if (!currentLog.value) return
  const rawText = `[${currentLog.value.time}] ${currentLog.value.method} ${currentLog.value.endpoint} -> HTTP ${currentLog.value.status}\n` +
    JSON.stringify(currentLog.value.data, null, 2)
  await navigator.clipboard.writeText(rawText)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 1800)
}

// 清除輸出
const clearOutput = () => {
  currentLog.value = null
}

// 清除 Token
const clearToken = () => {
  token.value = ''
}

// 複製 Token
const copyToken = async () => {
  if (!token.value) return
  await navigator.clipboard.writeText(token.value)
}

// 執行請求包裝器
const runApi = async (id: string, fn: () => Promise<void>) => {
  loadingAction.value = id
  try {
    await fn()
  } finally {
    loadingAction.value = null
  }
}

// 1. 健康檢查
const testHealth = () => runApi('health', async () => {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    logResult('/api/health', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/health', 'GET', 500, String(e), true)
  }
})

// 2. 註冊帳號 (預設 user/user)
const testRegister = (customUsername = 'user', customPassword = 'user') => runApi('register', async () => {
  const body = {
    username: customUsername,
    password: customPassword
  }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    const userToken = data.data?.token || data.token
    if (userToken) {
      token.value = userToken
    }
    logResult('/api/auth/register', 'POST', res.status, data)
  } catch (e) {
    logResult('/api/auth/register', 'POST', 500, String(e), true)
  }
})

// 3. 登入取得 Token (預設 root/root 或自訂帳密)
const testLogin = (customUsername?: string, customPassword?: string) => runApi('login', async () => {
  const body = {
    username: customUsername !== undefined ? customUsername : (authForm.value.username || 'root'),
    password: customPassword !== undefined ? customPassword : (authForm.value.password || 'root')
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    const userToken = data.data?.token || data.token
    if (userToken) {
      token.value = userToken
    }
    logResult('/api/auth/login', 'POST', res.status, data)
  } catch (e) {
    logResult('/api/auth/login', 'POST', 500, String(e), true)
  }
})

// 4. 身分驗證保護端點 (Auth Guard)
const testAuthMe = () => runApi('authMe', async () => {
  try {
    const headers: Record<string, string> = {}
    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`
    }
    const res = await fetch('/api/auth/me', { headers })
    const data = await res.json()
    logResult('/api/auth/me', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/auth/me', 'GET', 500, String(e), true)
  }
})

// 5. 取得 Notes 列表 (Model Active Record)
const testGetNotes = () => runApi('getNotes', async () => {
  try {
    const res = await fetch('/api/notes')
    const data = await res.json()
    logResult('/api/notes', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/notes', 'GET', 500, String(e), true)
  }
})

// 6. 建立 Note (Model Create + VineJS Valid)
const testCreateNote = () => runApi('createNote', async () => {
  const body = {
    title: `學習筆記 #${Math.floor(Math.random() * 100)}`,
    content: '體驗 Hono + AdonisJS 7 完美結合之開發架構'
  }
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    logResult('/api/notes', 'POST', res.status, data)
  } catch (e) {
    logResult('/api/notes', 'POST', 500, String(e), true)
  }
})

// 7. 觸發 VineJS Class 驗證失敗 (422)
const testValidationFail = () => runApi('valFail', async () => {
  const invalidBody = {
    title: '短', // title 少於 3 字元，且缺 content
  }
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidBody)
    })
    const data = await res.json()
    logResult('/api/notes (422 驗證)', 'POST', res.status, data)
  } catch (e) {
    logResult('/api/notes (422 驗證)', 'POST', 500, String(e), true)
  }
})

// 8. 資料庫 Transaction 測試
const testTransaction = () => runApi('tx', async () => {
  try {
    const res = await fetch('/api/notes/transaction-test', {
      method: 'POST'
    })
    const data = await res.json()
    logResult('/api/notes/transaction-test', 'POST', res.status, data)
  } catch (e) {
    logResult('/api/notes/transaction-test', 'POST', 500, String(e), true)
  }
})

// 9. 自訂 Macro 巨集測試
const testMacro = () => runApi('macro', async () => {
  try {
    const res = await fetch('/api/macro-test')
    const data = await res.json()
    logResult('/api/macro-test', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/macro-test', 'GET', 500, String(e), true)
  }
})

// 10. 全域 Exception Handler 錯誤捕捉測試
const testError = () => runApi('error', async () => {
  try {
    const res = await fetch('/api/error-test')
    const data = await res.json()
    logResult('/api/error-test', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/error-test', 'GET', 500, String(e), true)
  }
})

// 11. ApiFormatMiddleware 格式整合測試
const testFormat = () => runApi('format', async () => {
  try {
    const res = await fetch('/api/format-test')
    const data = await res.json()
    logResult('/api/format-test', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/format-test', 'GET', 500, String(e), true)
  }
})

// 12. Model 關聯與 Luxon DateTime 測試
const testRelation = () => runApi('relation', async () => {
  try {
    const res = await fetch('/api/relation-test')
    const data = await res.json()
    logResult('/api/relation-test', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/relation-test', 'GET', 500, String(e), true)
  }
})
</script>

<template>
  <div class="console-wrapper">
    <!-- Header 頂部看板 -->
    <header class="console-header">
      <div class="header-main">
        <div class="brand-badge">
          <span class="status-indicator"></span>
          <span class="brand-tag">Hono Edge</span>
        </div>
        <h1 class="console-title">AdonisJS 7 API Dev Console</h1>
        <p class="console-subtitle">企業級分層架構端點互動測試與 DevTools 預覽面板</p>
      </div>

      <!-- Token 身分認證卡片 -->
      <div class="token-card">
        <div class="token-header">
          <div class="token-status">
            <span class="token-dot" :class="{ active: !!token }"></span>
            <span class="token-label">{{ token ? '已取得存取 Token' : '未登入 (未附加 Token)' }}</span>
          </div>
          <div v-if="token" class="token-actions">
            <button class="btn-chip" @click="copyToken" title="複製 Token">複製</button>
            <button class="btn-chip btn-chip-danger" @click="clearToken" title="清除 Token">登出/清除</button>
          </div>
        </div>
        <div class="token-value-box">
          <span class="token-key font-mono">Bearer</span>
          <code class="token-text font-mono" :title="token || '尚未登入'">{{ token ? token.substring(0, 36) + '...' : '(執行註冊或登入以取得 JWT Token)' }}</code>
        </div>
      </div>
    </header>

    <!-- 按鈕分組清單 -->
    <main class="console-content">
      <!-- 類別 1: 基礎系統與認證 -->
      <section class="section-group">
        <div class="group-title-row">
          <span class="group-icon">🔐</span>
          <h2 class="group-title">身份驗證與系統守護 (Auth & System)</h2>
        </div>

        <!-- 快速帳密互動列 -->
        <div class="auth-toolbar">
          <div class="auth-toolbar-fields">
            <div class="auth-input-item">
              <span class="auth-input-label font-mono">帳號 USERNAME</span>
              <input v-model="authForm.username" class="auth-field font-mono" placeholder="root 或 user" />
            </div>
            <div class="auth-input-item">
              <span class="auth-input-label font-mono">密碼 PASSWORD</span>
              <input v-model="authForm.password" type="password" class="auth-field font-mono" placeholder="root 或 user" />
            </div>
          </div>
          <div class="auth-toolbar-actions">
            <button class="auth-action-pill" @click="testLogin(authForm.username, authForm.password)">
              🔐 自訂登入
            </button>
            <button class="auth-action-pill primary" @click="testRegister('user', 'user')">
              ✨ 註冊 user / user
            </button>
            <button class="auth-action-pill accent" @click="testLogin('root', 'root')">
              ⚡ 登入 root / root
            </button>
          </div>
        </div>

        <div class="button-grid">
          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'health' }"
            @click="testHealth"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#01</span>
            </div>
            <div class="btn-path font-mono">/api/health</div>
            <div class="btn-desc">健康檢查與伺服器運行狀態</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'register' }"
            @click="testRegister('user', 'user')"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#02</span>
            </div>
            <div class="btn-path font-mono">/api/auth/register</div>
            <div class="btn-desc">註冊 user/user 帳號並存取 JWT</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'login' }"
            @click="testLogin('root', 'root')"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#03</span>
            </div>
            <div class="btn-path font-mono">/api/auth/login</div>
            <div class="btn-desc">以 root/root 登入獲取 JWT Token</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'authMe' }"
            @click="testAuthMe"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#04</span>
            </div>
            <div class="btn-path font-mono">/api/auth/me</div>
            <div class="btn-desc">需 Bearer JWT，由 SQLite 撈取使用者真實資料</div>
          </button>
        </div>
      </section>

      <!-- 類別 2: 資料模型與驗證 -->
      <section class="section-group">
        <div class="group-title-row">
          <span class="group-icon">📦</span>
          <h2 class="group-title">資料模型與交易處理 (Lucid & VineJS)</h2>
        </div>
        <div class="button-grid">
          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'getNotes' }"
            @click="testGetNotes"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#05</span>
            </div>
            <div class="btn-path font-mono">/api/notes</div>
            <div class="btn-desc">查詢筆記列表 (Active Record)</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'createNote' }"
            @click="testCreateNote"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#06</span>
            </div>
            <div class="btn-path font-mono">/api/notes</div>
            <div class="btn-desc">新增筆記 (VineJS 驗證通過)</div>
          </button>

          <button
            class="api-action-btn btn-warning-theme"
            :class="{ loading: loadingAction === 'valFail' }"
            @click="testValidationFail"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#07</span>
            </div>
            <div class="btn-path font-mono">/api/notes</div>
            <div class="btn-desc">故意傳入空資料 (觸發 422 驗證失敗)</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'tx' }"
            @click="testTransaction"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#08</span>
            </div>
            <div class="btn-path font-mono">/api/notes/transaction-test</div>
            <div class="btn-desc">資料庫 Transaction 事務處理</div>
          </button>
        </div>
      </section>

      <!-- 類別 3: 進階核心特性 -->
      <section class="section-group">
        <div class="group-title-row">
          <span class="group-icon">⚡</span>
          <h2 class="group-title">進階特性與錯誤控管 (Macros & Handlers)</h2>
        </div>
        <div class="button-grid">
          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'macro' }"
            @click="testMacro"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#09</span>
            </div>
            <div class="btn-path font-mono">/api/macro-test</div>
            <div class="btn-desc">自訂 Response Macro 巨集回應</div>
          </button>

          <button
            class="api-action-btn btn-danger-theme"
            :class="{ loading: loadingAction === 'error' }"
            @click="testError"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#10</span>
            </div>
            <div class="btn-path font-mono">/api/error-test</div>
            <div class="btn-desc">全局 Exception Handler 錯誤攔截</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'format' }"
            @click="testFormat"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#11</span>
            </div>
            <div class="btn-path font-mono">/api/format-test</div>
            <div class="btn-desc">ApiFormatMiddleware 統一響應格式</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'relation' }"
            @click="testRelation"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#12</span>
            </div>
            <div class="btn-path font-mono">/api/relation-test</div>
            <div class="btn-desc">Model 關聯 (hasMany/belongsTo) 與 DateTime 驗證</div>
          </button>
        </div>
      </section>

      <!-- DevTools 終端機模擬面板 (極致高對比度深色面板) -->
      <section class="terminal-section">
        <div class="terminal-card">
          <!-- 終端機頂部狀態列 -->
          <div class="terminal-header">
            <div class="terminal-controls">
              <span class="dot dot-close"></span>
              <span class="dot dot-minimize"></span>
              <span class="dot dot-maximize"></span>
              <span class="terminal-title font-mono">DevTools Console Output</span>
            </div>

            <div class="terminal-meta">
              <div v-if="currentLog" class="http-status-pill" :class="currentLog.isError ? 'pill-error' : 'pill-success'">
                HTTP {{ currentLog.status }}
              </div>
              <button
                class="terminal-btn"
                :class="{ 'btn-success': isCopied }"
                :disabled="!currentLog"
                @click="copyOutput"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                </svg>
                <span>{{ isCopied ? '已複製！' : '複製輸出' }}</span>
              </button>
              <button
                class="terminal-btn"
                :disabled="!currentLog"
                @click="clearOutput"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>清除</span>
              </button>
            </div>
          </div>

          <!-- 終端機代碼輸出主體 -->
          <div class="terminal-body">
            <pre class="console-code font-mono" v-html="highlightedContent"></pre>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.console-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  position: relative;
  z-index: 1;
}

/* ==========================================
   Header 樣式
   ========================================== */
.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.75rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  backdrop-filter: var(--backdrop-filter);
  -webkit-backdrop-filter: var(--backdrop-filter);
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--cf-gradient-soft);
  border: 1px solid rgba(243, 128, 32, 0.3);
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  margin-bottom: 0.75rem;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}

.brand-tag {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--cf-orange);
  text-transform: uppercase;
}

.console-title {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  background: linear-gradient(135deg, #ffffff 40%, #cbd5e1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 0.35rem;
}

.console-subtitle {
  font-size: 0.92rem;
  color: var(--text-secondary);
}

/* Token 卡片 */
.token-card {
  min-width: 320px;
  flex: 1;
  max-width: 440px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  box-shadow: var(--shadow-sm);
}

.token-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.token-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.token-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--text-muted);
}

.token-dot.active {
  background-color: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}

.token-actions {
  display: flex;
  gap: 0.4rem;
}

.btn-chip {
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.btn-chip:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.15);
}

.btn-chip-danger:hover {
  color: var(--color-error);
  border-color: rgba(239, 68, 68, 0.4);
}

.token-value-box {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.75rem;
  overflow: hidden;
}

.token-key {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--cf-orange);
  background: var(--cf-gradient-soft);
  padding: 2px 6px;
  border-radius: 4px;
}

.token-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================
   按鈕群組與卡片樣式 (醒目按鈕設計)
   ========================================== */
.console-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.group-icon {
  font-size: 1.1rem;
}

.group-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: -0.01em;
  text-transform: uppercase;
  font-size: 0.85rem;
}

/* ==========================================
   Auth 快速互動列樣式
   ========================================== */
.auth-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.15rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(12px);
}

.auth-toolbar-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.auth-input-item {
  display: flex;
  align-items: center;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.65rem;
  gap: 0.5rem;
}

.auth-input-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.05em;
}

.auth-field {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.85rem;
  width: 110px;
  outline: none;
}

.auth-field:focus {
  color: #fff;
}

.auth-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.auth-action-pill {
  padding: 0.4rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.auth-action-pill:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.auth-action-pill.primary {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #93c5fd;
}

.auth-action-pill.primary:hover {
  background: rgba(59, 130, 246, 0.35);
  border-color: #60a5fa;
  color: #fff;
}

.auth-action-pill.accent {
  background: rgba(243, 128, 32, 0.2);
  border-color: rgba(243, 128, 32, 0.5);
  color: #fdba74;
}

.auth-action-pill.accent:hover {
  background: rgba(243, 128, 32, 0.35);
  border-color: #f97316;
  color: #fff;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.api-action-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  padding: 1.1rem 1.25rem;
  cursor: pointer;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
  backdrop-filter: var(--backdrop-filter);
  -webkit-backdrop-filter: var(--backdrop-filter);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.api-action-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: transparent;
  transition: background-color var(--transition-fast);
}

.api-action-btn:hover {
  background: var(--bg-card-hover);
  border-color: var(--cf-orange);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(243, 128, 32, 0.22);
}

.api-action-btn:hover::before {
  background: var(--cf-orange);
}

.api-action-btn:active {
  transform: translateY(0);
}

.api-action-btn.loading {
  opacity: 0.7;
  pointer-events: none;
}

.btn-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 0.65rem;
}

.badge-method {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

.badge-method.get {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge-method.post {
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.btn-number {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.btn-path {
  font-size: 0.88rem;
  font-weight: 600;
  color: #f1f5f9;
  word-break: break-all;
  margin-bottom: 0.4rem;
}

.btn-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* 特定色系按鈕（如 422 警告或錯誤測試） */
.btn-warning-theme:hover {
  border-color: var(--color-warning);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.22);
}
.btn-warning-theme:hover::before {
  background: var(--color-warning);
}

.btn-danger-theme:hover {
  border-color: var(--color-error);
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.22);
}
.btn-danger-theme:hover::before {
  background: var(--color-error);
}

/* ==========================================
   DevTools 終端機區塊 (高對比度、極致清晰)
   ========================================== */
.terminal-section {
  margin-top: 1rem;
}

.terminal-card {
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.25rem;
  background: #0f172a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-wrap: wrap;
  gap: 0.75rem;
}

.terminal-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.dot-close { background-color: #ef4444; }
.dot-minimize { background-color: #f59e0b; }
.dot-maximize { background-color: #10b981; }

.terminal-title {
  margin-left: 0.5rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #94a3b8;
}

.terminal-meta {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.http-status-pill {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-full);
}

.pill-success {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.pill-error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.terminal-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  color: #cbd5e1;
  transition: all var(--transition-fast);
}

.terminal-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.25);
}

.terminal-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.terminal-btn.btn-success {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}

.terminal-body {
  padding: 1.5rem;
  min-height: 260px;
  max-height: 480px;
  overflow-y: auto;
  background: #070b14;
}

.console-code {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.65;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

/* 終端輸出語法高亮 */
:deep(.text-comment) {
  color: #64748b;
  font-style: italic;
}

:deep(.log-time) {
  color: #e2e8f0;
  font-weight: 500;
}

:deep(.log-method) {
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

:deep(.log-method.get) {
  color: #34d399;
  background: rgba(16, 185, 129, 0.15);
}

:deep(.log-method.post) {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
}

:deep(.log-endpoint) {
  color: #fbbf24;
  font-weight: 600;
}

:deep(.log-status) {
  font-weight: 700;
}

:deep(.status-success) {
  color: #34d399;
}

:deep(.status-error) {
  color: #f87171;
}

:deep(.json-key) {
  color: #38bdf8; /* 亮青藍鍵名 */
  font-weight: 600;
}

:deep(.json-string) {
  color: #34d399; /* 亮翠綠字串 */
}

:deep(.json-number) {
  color: #fb923c; /* 溫暖橙色數字 */
}

:deep(.json-boolean) {
  color: #f472b6; /* 亮紫粉布林值 */
  font-weight: 700;
}

:deep(.json-null) {
  color: #94a3b8; /* 柔和暗灰 null */
  font-style: italic;
}

@media (max-width: 768px) {
  .console-header {
    flex-direction: column;
    align-items: stretch;
  }
  .token-card {
    max-width: 100%;
  }
  .button-grid {
    grid-template-columns: 1fr;
  }
}
</style>
