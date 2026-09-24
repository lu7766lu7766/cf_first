<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

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

const tokenInfo = computed(() => {
  if (!token.value) return null
  if (token.value.startsWith('oat_')) {
    return {
      type: 'OAT (Access Token)',
      prefix: 'oat_',
      secret: token.value.substring(4, 12) + '...',
      isOat: true
    }
  }
  try {
    const parts = token.value.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      return { ...payload, type: 'JWT', isJwt: true }
    }
  } catch {
    return null
  }
  return null
})

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

// 登出與撤銷 Token (可選單一裝置或全部裝置)
const logoutToken = (all = false) => runApi('logout', async () => {
  if (!token.value) {
    token.value = ''
    return
  }
  const currentToken = token.value
  try {
    const res = await fetch(`/api/auth/logout${all ? '?all=true' : ''}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    })
    const data = await res.json()
    token.value = ''
    logResult(`/api/auth/logout${all ? '?all=true' : ''}`, 'POST', res.status, data)
  } catch (e) {
    token.value = ''
    logResult('/api/auth/logout', 'POST', 500, String(e), true)
  }
})

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

// 4.1 取得使用者列表 (需要 JWT Auth Guard)
const testGetUsers = () => runApi('getUsers', async () => {
  try {
    const headers: Record<string, string> = {}
    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`
    }
    const res = await fetch('/api/users', { headers })
    const data = await res.json()
    logResult('/api/users', 'GET', res.status, data)
  } catch (e) {
    logResult('/api/users', 'GET', 500, String(e), true)
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

// ==========================================
// Cloudflare Workers AI 邊緣智慧專用邏輯
// ==========================================
interface AiUsageData {
  today_calls: number
  total_calls: number
  daily_limit: number
  remaining_calls: number
  reset_time?: string
  recent_logs?: Array<{
    id: number
    model: string
    prompt: string
    response: string
    tokens_used: number
    duration_ms: number
    is_mock: boolean
    created_at: string
  }>
}

const aiUsage = ref<AiUsageData>({
  today_calls: 0,
  total_calls: 0,
  daily_limit: 100,
  remaining_calls: 100,
  reset_time: '',
  recent_logs: []
})

const aiPrompt = ref('請用繁體中文列出 3 個 Cloudflare Workers AI 的核心優勢')
const aiModel = ref('@cf/meta/llama-3.1-8b-instruct-fast')
const aiResult = ref<{
  text: string
  model: string
  duration_ms: number
  tokens_used: number
  is_mock: boolean
  timestamp: string
} | null>(null)
const isAiCalling = ref(false)
const isAiResultCopied = ref(false)
const showRecentAiLogs = ref(false)

// 查詢 Workers AI 配額與統計
const fetchAiUsage = async (silent = false) => {
  if (!silent) loadingAction.value = 'aiUsage'
  try {
    const res = await fetch('/api/ai/usage')
    const json = await res.json()
    if (json.data) {
      aiUsage.value = json.data
    }
    if (!silent) {
      logResult('/api/ai/usage', 'GET', res.status, json)
    }
  } catch (e) {
    if (!silent) {
      logResult('/api/ai/usage', 'GET', 500, String(e), true)
    }
  } finally {
    if (!silent) loadingAction.value = null
  }
}

// 發送 Workers AI 請求
const callWorkersAi = async (customPrompt?: string) => {
  const promptToSend = (customPrompt || aiPrompt.value || '').trim()
  if (!promptToSend) return

  isAiCalling.value = true
  loadingAction.value = 'aiGenerate'
  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptToSend,
        model: aiModel.value
      })
    })
    const data = await res.json()
    logResult('/api/ai/generate', 'POST', res.status, data)

    if (data.data) {
      aiResult.value = {
        text: data.data.result,
        model: data.data.model,
        duration_ms: data.data.duration_ms,
        tokens_used: data.data.tokens_used,
        is_mock: data.data.is_mock,
        timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false })
      }
      if (data.data.usage) {
        aiUsage.value = {
          ...aiUsage.value,
          ...data.data.usage
        }
      }
      // 靜默更新最新歷史清單
      fetchAiUsage(true)
    }
  } catch (e) {
    logResult('/api/ai/generate', 'POST', 500, String(e), true)
  } finally {
    isAiCalling.value = false
    loadingAction.value = null
  }
}

const copyAiResult = async () => {
  if (!aiResult.value?.text) return
  await navigator.clipboard.writeText(aiResult.value.text)
  isAiResultCopied.value = true
  setTimeout(() => {
    isAiResultCopied.value = false
  }, 1800)
}

const setPromptPreset = (presetText: string) => {
  aiPrompt.value = presetText
}

const handleAiKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    callWorkersAi()
  }
}

onMounted(() => {
  fetchAiUsage(true)
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
            <span v-if="tokenInfo?.jti" class="token-jti-badge font-mono" title="RFC 7519 每次登入簽發之唯一 UUID">
              jti: {{ tokenInfo.jti.substring(0, 8) }}...
            </span>
            <span v-else-if="tokenInfo?.isOat" class="token-jti-badge font-mono" title="AdonisJS 原生 Access Token (OAT)">
              OAT: {{ tokenInfo.secret }}
            </span>
          </div>
          <div v-if="token" class="token-actions">
            <button class="btn-chip" @click="copyToken" title="複製 Token">複製</button>
            <button class="btn-chip btn-chip-danger" @click="() => logoutToken(false)" title="呼叫後端 /api/auth/logout 撤銷當前 Token">登出本機</button>
            <button class="btn-chip btn-chip-warning" @click="() => logoutToken(true)" title="登出並撤銷此帳號所有裝置 Token">全裝置登出</button>
          </div>
        </div>
        <div class="token-value-box">
          <span class="token-key font-mono">Bearer</span>
          <code class="token-text font-mono" :title="token || '尚未登入'">{{ token ? `${token.substring(0, 18)}...${token.substring(token.length - 12)}` : '(執行註冊或登入以取得 Access Token)' }}</code>
        </div>
      </div>
    </header>

    <!-- 按鈕分組清單 -->
    <main class="console-content">
      <!-- Cloudflare Workers AI 邊緣智慧專區 (Workers AI Studio) -->
      <section class="section-group ai-studio-section">
        <div class="ai-studio-header">
          <div class="group-title-row">
            <span class="group-icon ai-glow-icon">🤖</span>
            <div>
              <h2 class="group-title">Cloudflare Workers AI 邊緣智慧中心</h2>
              <p class="ai-section-subtitle">全球無伺服器 GPU 叢集加速推論 · 配額即時追蹤</p>
            </div>
          </div>
          <div class="ai-header-actions">
            <button
              class="btn-refresh-quota font-mono"
              :class="{ 'is-spinning': loadingAction === 'aiUsage' }"
              @click="() => fetchAiUsage(false)"
              title="重新載入配額統計"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              <span>刷新配額</span>
            </button>
          </div>
        </div>

        <!-- 配額統計三大指標看板 (Quota Cards) -->
        <div class="ai-metrics-grid">
          <!-- 卡片 1: 今日已調用量 -->
          <div class="ai-metric-card">
            <div class="metric-top">
              <span class="metric-badge metric-today font-mono">TODAY</span>
              <span class="metric-icon">📊</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-number font-mono">{{ aiUsage.today_calls }}</span>
              <span class="metric-unit">次</span>
            </div>
            <div class="metric-label">今日已調用量</div>
            <div class="metric-progress-wrapper">
              <div
                class="metric-progress-bar"
                :style="{ width: `${Math.min(100, Math.round((aiUsage.today_calls / (aiUsage.daily_limit || 100)) * 100))}%` }"
              ></div>
            </div>
            <div class="metric-footer font-mono">
              <span>使用率 {{ Math.min(100, Math.round((aiUsage.today_calls / (aiUsage.daily_limit || 100)) * 100)) }}%</span>
              <span class="metric-subtext">00:00 重置</span>
            </div>
          </div>

          <!-- 卡片 2: 剩餘可用額度 -->
          <div class="ai-metric-card" :class="aiUsage.remaining_calls < 10 ? 'warning-glow' : 'success-glow'">
            <div class="metric-top">
              <span
                class="metric-badge font-mono"
                :class="aiUsage.remaining_calls < 10 ? 'badge-warning' : 'badge-success'"
              >
                REMAINING
              </span>
              <span class="metric-icon">⚡</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-number font-mono" :class="aiUsage.remaining_calls < 10 ? 'text-warning' : 'text-success'">
                {{ aiUsage.remaining_calls }}
              </span>
              <span class="metric-unit">次</span>
            </div>
            <div class="metric-label">今日剩餘額度</div>
            <div class="metric-status-pill font-mono">
              <span class="status-dot" :class="aiUsage.remaining_calls < 10 ? 'dot-warn' : 'dot-ok'"></span>
              <span>上限 {{ aiUsage.daily_limit }} 次 / 日</span>
            </div>
          </div>

          <!-- 卡片 3: 累計總調用量 -->
          <div class="ai-metric-card">
            <div class="metric-top">
              <span class="metric-badge metric-total font-mono">LIFETIME</span>
              <span class="metric-icon">📈</span>
            </div>
            <div class="metric-value-row">
              <span class="metric-number font-mono text-cf">{{ aiUsage.total_calls }}</span>
              <span class="metric-unit">次</span>
            </div>
            <div class="metric-label">歷史總調用量</div>
            <div class="metric-footer">
              <span class="metric-badge-soft font-mono">D1 資料庫存儲</span>
              <button
                v-if="aiUsage.recent_logs?.length"
                class="btn-toggle-logs font-mono"
                @click="showRecentAiLogs = !showRecentAiLogs"
              >
                {{ showRecentAiLogs ? '隱藏日誌 ▲' : `查看日誌 (${aiUsage.recent_logs.length}) ▼` }}
              </button>
            </div>
          </div>
        </div>

        <!-- 歷史調用紀錄摺疊清單 -->
        <div v-if="showRecentAiLogs && aiUsage.recent_logs?.length" class="ai-logs-drawer">
          <div class="drawer-header">
            <span class="drawer-title font-mono">📋 最近調用歷史紀錄</span>
            <span class="drawer-count font-mono">共 {{ aiUsage.recent_logs.length }} 筆記錄</span>
          </div>
          <div class="drawer-table-wrapper">
            <table class="ai-logs-table font-mono">
              <thead>
                <tr>
                  <th>#</th>
                  <th>時間</th>
                  <th>模型</th>
                  <th>提問內容 (Prompt)</th>
                  <th>耗時</th>
                  <th>類型</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in aiUsage.recent_logs" :key="log.id" @click="setPromptPreset(log.prompt)" title="點擊載入此提問">
                  <td>{{ log.id }}</td>
                  <td>{{ log.created_at.slice(11, 19) }}</td>
                  <td class="log-model-col">{{ log.model.replace('@cf/meta/', '').replace('@cf/', '') }}</td>
                  <td class="log-prompt-col">{{ log.prompt.length > 35 ? log.prompt.slice(0, 35) + '...' : log.prompt }}</td>
                  <td>{{ log.duration_ms }}ms</td>
                  <td>
                    <span :class="log.is_mock ? 'tag-mock' : 'tag-edge'">{{ log.is_mock ? 'Mock' : 'Edge' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 互動測試控制台 (Interactive Playground) -->
        <div class="ai-playground-card">
          <div class="playground-topbar">
            <!-- 模型切換 -->
            <div class="model-select-group">
              <label class="input-label font-mono">MODEL 模型選擇</label>
              <select v-model="aiModel" class="model-select font-mono">
                <option value="@cf/meta/llama-3.1-8b-instruct-fast">Llama 3.1 8B Instruct (Fast - 推薦)</option>
                <option value="@cf/meta/llama-3.2-3b-instruct">Llama 3.2 3B Instruct (輕量極速)</option>
                <option value="@cf/meta/llama-3-8b-instruct">Llama 3 8B Instruct (經典通用)</option>
                <option value="@cf/qwen/qwen1.5-7b-chat-awq">Qwen 1.5 7B Chat (中文優化)</option>
              </select>
            </div>

            <!-- 快捷提問晶片 (Prompt Chips) -->
            <div class="prompt-chips">
              <span class="chips-title font-mono">範例提問:</span>
              <button
                type="button"
                class="prompt-chip"
                @click="setPromptPreset('請用繁體中文列出 3 個 Cloudflare Workers AI 的核心優勢')"
              >
                ✨ Workers AI 優勢
              </button>
              <button
                type="button"
                class="prompt-chip"
                @click="setPromptPreset('寫一段繁體中文的 Cloudflare Workers 與邊緣運算介紹')"
              >
                🌐 邊緣運算簡介
              </button>
              <button
                type="button"
                class="prompt-chip"
                @click="setPromptPreset('寫一個 TypeScript 非同步重試 (Retry with exponential backoff) 函式')"
              >
                💻 TS 重試函式
              </button>
              <button
                type="button"
                class="prompt-chip"
                @click="setPromptPreset('為全端開發者寫一首關於邊緣運算與 AI 的幽默短詩')"
              >
                📜 邊緣運算短詩
              </button>
            </div>
          </div>

          <!-- 輸入區域 -->
          <div class="ai-input-wrapper">
            <textarea
              v-model="aiPrompt"
              class="ai-textarea font-mono"
              rows="3"
              placeholder="輸入欲詢問的問題或提示詞... 按 Ctrl+Enter 或 Cmd+Enter 可直接送出"
              @keydown="handleAiKeyDown"
            ></textarea>
            <div class="ai-input-actions">
              <div class="input-hint font-mono">
                <span>{{ aiPrompt.length }} 字元</span>
                <span class="hint-key">Ctrl + Enter 發送</span>
              </div>
              <button
                class="btn-call-ai font-mono"
                :disabled="isAiCalling || !aiPrompt.trim()"
                @click="() => callWorkersAi()"
              >
                <span v-if="isAiCalling" class="spinner"></span>
                <span v-else>🚀</span>
                <span>{{ isAiCalling ? 'GPU 推論中...' : '調用 Workers AI' }}</span>
              </button>
            </div>
          </div>

          <!-- AI 回傳結果卡片 (Result Card) -->
          <div v-if="aiResult" class="ai-result-box">
            <div class="result-header">
              <div class="result-meta">
                <span class="result-badge font-mono">{{ aiResult.model }}</span>
                <span class="result-tag duration font-mono">⏱️ {{ aiResult.duration_ms }} ms</span>
                <span class="result-tag tokens font-mono">🔤 ~{{ aiResult.tokens_used }} tokens</span>
                <span
                  class="result-tag font-mono"
                  :class="aiResult.is_mock ? 'tag-mock' : 'tag-edge'"
                >
                  {{ aiResult.is_mock ? '💡 本機備援/模擬' : '⚡ Cloudflare Edge GPU' }}
                </span>
                <span class="result-time font-mono">{{ aiResult.timestamp }}</span>
              </div>
              <button class="btn-copy-result font-mono" @click="copyAiResult">
                {{ isAiResultCopied ? '✔ 已複製' : '📋 複製結果' }}
              </button>
            </div>
            <div class="result-content-body font-mono">
              {{ aiResult.text }}
            </div>
          </div>
        </div>
      </section>

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

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'getUsers' }"
            @click="testGetUsers"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#04b</span>
            </div>
            <div class="btn-path font-mono">/api/users</div>
            <div class="btn-desc">需 Bearer Token，查詢所有使用者列表</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'logout' }"
            @click="() => logoutToken(false)"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#04c</span>
            </div>
            <div class="btn-path font-mono">/api/auth/logout</div>
            <div class="btn-desc">需 Bearer Token，註銷當前 Token 並自 DB 刪除</div>
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
            <div class="btn-desc">查詢筆記列表 (預載入 belongsTo user 關聯)</div>
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

      <!-- 類別 4: Cloudflare Workers AI 邊緣運算 (Workers AI) -->
      <section class="section-group">
        <div class="group-title-row">
          <span class="group-icon">🤖</span>
          <h2 class="group-title">Cloudflare Workers AI 介面測試 (Workers AI APIs)</h2>
        </div>
        <div class="button-grid">
          <button
            class="api-action-btn btn-ai-theme"
            :class="{ loading: loadingAction === 'aiGenerate' }"
            @click="() => callWorkersAi()"
          >
            <div class="btn-top">
              <span class="badge-method post">POST</span>
              <span class="btn-number font-mono">#13</span>
            </div>
            <div class="btn-path font-mono">/api/ai/generate</div>
            <div class="btn-desc">調用 Workers AI 生成文字，並即時更新剩餘調用量</div>
          </button>

          <button
            class="api-action-btn"
            :class="{ loading: loadingAction === 'aiUsage' }"
            @click="() => fetchAiUsage(false)"
          >
            <div class="btn-top">
              <span class="badge-method get">GET</span>
              <span class="btn-number font-mono">#14</span>
            </div>
            <div class="btn-path font-mono">/api/ai/usage</div>
            <div class="btn-desc">查詢今日已調用量、總調用量與剩餘配額</div>
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

.token-jti-badge {
  font-size: 0.7rem;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
  padding: 1px 7px;
  border-radius: 9999px;
  font-weight: 500;
}

.token-sso-badge {
  font-size: 0.7rem;
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.35);
  padding: 1px 7px;
  border-radius: 9999px;
  font-weight: 500;
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

.btn-chip-warning:hover {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.1);
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

/* ==========================================
   Workers AI Studio 樣式
   ========================================== */
.ai-studio-section {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 27, 75, 0.45) 100%);
  border: 1px solid rgba(243, 128, 32, 0.25);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  box-shadow: 0 8px 32px -4px rgba(243, 128, 32, 0.08);
  position: relative;
  overflow: hidden;
}

.ai-studio-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--cf-gradient);
}

.ai-studio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.ai-glow-icon {
  background: rgba(243, 128, 32, 0.15);
  border-radius: var(--radius-md);
  padding: 0.5rem;
  font-size: 1.5rem;
  box-shadow: 0 0 16px rgba(243, 128, 32, 0.25);
}

.ai-section-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.btn-refresh-quota {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-refresh-quota:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--cf-orange);
  color: var(--cf-orange);
}

.btn-refresh-quota.is-spinning svg {
  animation: spin 1s linear infinite;
}

/* 指標卡片群 */
.ai-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.ai-metric-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

.ai-metric-card:hover {
  transform: translateY(-2px);
  border-color: rgba(243, 128, 32, 0.35);
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.4);
}

.ai-metric-card.success-glow {
  border-color: rgba(16, 185, 129, 0.3);
}

.ai-metric-card.warning-glow {
  border-color: rgba(239, 68, 68, 0.4);
}

.metric-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-badge {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.metric-today {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.metric-total {
  background: rgba(243, 128, 32, 0.15);
  color: #fb923c;
  border: 1px solid rgba(243, 128, 32, 0.3);
}

.badge-success {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-warning {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.metric-value-row {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-top: 0.2rem;
}

.metric-number {
  font-size: 2.25rem;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}

.metric-unit {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.metric-label {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.text-success {
  color: #10b981;
}

.text-warning {
  color: #f87171;
}

.text-cf {
  color: var(--cf-orange);
}

.metric-progress-wrapper {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
  margin-top: 0.3rem;
}

.metric-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  border-radius: 9999px;
  transition: width 0.4s ease;
}

.metric-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.metric-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-ok {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.dot-warn {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.metric-badge-soft {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.btn-toggle-logs {
  background: transparent;
  border: none;
  color: var(--cf-orange);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn-toggle-logs:hover {
  color: var(--cf-orange-hover);
}

/* 歷史日誌抽屜 */
.ai-logs-drawer {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  animation: fadeIn 0.25s ease-out;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.drawer-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-primary);
}

.drawer-count {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.drawer-table-wrapper {
  overflow-x: auto;
}

.ai-logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  text-align: left;
}

.ai-logs-table th {
  padding: 0.5rem 0.6rem;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-logs-table td {
  padding: 0.55rem 0.6rem;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.ai-logs-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.ai-logs-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.04);
}

.log-model-col {
  color: #38bdf8;
  font-weight: 600;
}

.log-prompt-col {
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-mock {
  display: inline-block;
  font-size: 0.68rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.tag-edge {
  display: inline-block;
  font-size: 0.68rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

/* 互動提問區 */
.ai-playground-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.playground-topbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.model-select-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.input-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.model-select {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.model-select:focus {
  border-color: var(--cf-orange);
}

.prompt-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chips-title {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.prompt-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-full);
  padding: 0.25rem 0.7rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.prompt-chip:hover {
  background: rgba(243, 128, 32, 0.15);
  border-color: rgba(243, 128, 32, 0.4);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.ai-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.ai-textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  font-size: 0.88rem;
  color: var(--text-primary);
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
  transition: border-color var(--transition-fast);
}

.ai-textarea:focus {
  outline: none;
  border-color: var(--cf-orange);
  box-shadow: 0 0 0 3px rgba(243, 128, 32, 0.15);
}

.ai-input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hint-key {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.btn-call-ai {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--cf-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #ffffff;
  padding: 0.65rem 1.4rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 4px 14px rgba(243, 128, 32, 0.35);
}

.btn-call-ai:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(243, 128, 32, 0.45);
}

.btn-call-ai:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

/* AI 結果呈現卡片 */
.ai-result-box {
  background: #080c14;
  border: 1px solid rgba(243, 128, 32, 0.3);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.result-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.result-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.result-tag {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.result-time {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.btn-copy-result {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-copy-result:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
}

.result-content-body {
  font-size: 0.92rem;
  line-height: 1.7;
  color: #f1f5f9;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(0, 0, 0, 0.35);
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.btn-ai-theme:hover {
  border-color: var(--cf-orange);
  box-shadow: 0 0 15px rgba(243, 128, 32, 0.25);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
