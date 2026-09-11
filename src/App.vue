<script setup lang="ts">
import { ref } from 'vue'

const output = ref<string>('點擊下方按鈕以測試各項 AdonisJS 7 風格之 Hono API，結果將同步輸出於瀏覽器 DevTools Console。')
const token = ref<string>('')

const logResult = (name: string, status: number, data: unknown) => {
  const resultStr = `[${new Date().toLocaleTimeString()}] ${name} -> HTTP ${status}\n` + JSON.stringify(data, null, 2)
  output.value = resultStr
  console.group(`API 測試: ${name} (HTTP ${status})`)
  console.log('回應資料 (Data):', data)
  console.groupEnd()
}

// 1. 健康檢查
const testHealth = async () => {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    logResult('GET /api/health', res.status, data)
  } catch (e) {
    logResult('GET /api/health (Error)', 500, String(e))
  }
}

// 2. 註冊帳號
const testRegister = async () => {
  const randomSuffix = Math.floor(Math.random() * 1000)
  const body = {
    email: `user${randomSuffix}@example.com`,
    password: 'password123',
    fullName: `Test User ${randomSuffix}`
  }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    logResult('POST /api/auth/register', res.status, data)
  } catch (e) {
    logResult('POST /api/auth/register (Error)', 500, String(e))
  }
}

// 3. 登入取得 Token
const testLogin = async () => {
  const body = {
    email: 'admin@example.com',
    password: 'password123'
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (data.token) {
      token.value = data.token
    }
    logResult('POST /api/auth/login', res.status, data)
  } catch (e) {
    logResult('POST /api/auth/login (Error)', 500, String(e))
  }
}

// 4. 身分驗證保護端點 (Auth Guard)
const testAuthMe = async () => {
  try {
    const headers: Record<string, string> = {}
    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`
    }
    const res = await fetch('/api/auth/me', { headers })
    const data = await res.json()
    logResult('GET /api/auth/me', res.status, data)
  } catch (e) {
    logResult('GET /api/auth/me (Error)', 500, String(e))
  }
}

// 5. 取得 Notes 列表 (Model Active Record)
const testGetNotes = async () => {
  try {
    const res = await fetch('/api/notes')
    const data = await res.json()
    logResult('GET /api/notes', res.status, data)
  } catch (e) {
    logResult('GET /api/notes (Error)', 500, String(e))
  }
}

// 6. 建立 Note (Model Create + VineJS Valid)
const testCreateNote = async () => {
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
    logResult('POST /api/notes', res.status, data)
  } catch (e) {
    logResult('POST /api/notes (Error)', 500, String(e))
  }
}

// 7. 觸發 VineJS Class 驗證失敗 (422)
const testValidationFail = async () => {
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
    logResult('POST /api/notes (Validation 422)', res.status, data)
  } catch (e) {
    logResult('POST /api/notes (Validation Fail Error)', 500, String(e))
  }
}

// 8. 資料庫 Transaction 測試
const testTransaction = async () => {
  try {
    const res = await fetch('/api/notes/transaction-test', {
      method: 'POST'
    })
    const data = await res.json()
    logResult('POST /api/notes/transaction-test', res.status, data)
  } catch (e) {
    logResult('POST /api/notes/transaction-test (Error)', 500, String(e))
  }
}

// 9. 自訂 Macro 巨集測試
const testMacro = async () => {
  try {
    const res = await fetch('/api/macro-test')
    const data = await res.json()
    logResult('GET /api/macro-test', res.status, data)
  } catch (e) {
    logResult('GET /api/macro-test (Error)', 500, String(e))
  }
}

// 10. 全域 Exception Handler 錯誤捕捉測試
const testError = async () => {
  try {
    const res = await fetch('/api/error-test')
    const data = await res.json()
    logResult('GET /api/error-test', res.status, data)
  } catch (e) {
    logResult('GET /api/error-test (Error)', 500, String(e))
  }
}
</script>

<template>
  <div style="padding: 20px; font-family: monospace;">
    <h2>AdonisJS 7 API Dev Console (Hono Edge)</h2>
    <p>Token: <span>{{ token ? token.substring(0, 20) + '...' : '(尚未登入)' }}</span></p>

    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
      <button @click="testHealth">1. GET /api/health (健康檢查)</button>
      <button @click="testRegister">2. POST /api/auth/register (註冊)</button>
      <button @click="testLogin">3. POST /api/auth/login (登入取 Token)</button>
      <button @click="testAuthMe">4. GET /api/auth/me (Auth Guard)</button>
      <button @click="testGetNotes">5. GET /api/notes (Model Query)</button>
      <button @click="testCreateNote">6. POST /api/notes (Model Create)</button>
      <button @click="testValidationFail">7. POST /api/notes (觸發 422 驗證)</button>
      <button @click="testTransaction">8. POST /api/notes/transaction-test (DB 事務)</button>
      <button @click="testMacro">9. GET /api/macro-test (Response Macro)</button>
      <button @click="testError">10. GET /api/error-test (Exception Handler)</button>
    </div>

    <hr />

    <h3>DevTools 輸出預覽：</h3>
    <pre style="background: #eee; padding: 12px; border: 1px solid #ccc; max-height: 400px; overflow: auto; white-space: pre-wrap;">{{ output }}</pre>
  </div>
</template>
