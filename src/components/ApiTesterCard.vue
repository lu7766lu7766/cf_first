<script setup lang="ts">
import { ref } from 'vue'
import type { EchoResponse } from '../types/api'

const pingLatency = ref<number | null>(null)
const isPinging = ref(false)

const postMessage = ref('你好，來自 Vue 前端的訊息！')
const postSender = ref('訪客測試員')
const isPosting = ref(false)
const echoResult = ref<EchoResponse | null>(null)

// 測試邊緣 API 往返延遲
const testPing = async () => {
  isPinging.value = true
  const startTime = performance.now()
  try {
    const res = await fetch('/api/health')
    if (res.ok) {
      pingLatency.value = Math.round(performance.now() - startTime)
    }
  } catch (err) {
    console.error('Ping failed:', err)
  } finally {
    isPinging.value = false
  }
}

// 發送 POST 請求給 Hono Edge Worker
const sendEcho = async () => {
  if (!postMessage.value.trim()) return
  isPosting.value = true
  try {
    const res = await fetch('/api/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: postMessage.value,
        sender: postSender.value
      })
    })
    const data: EchoResponse = await res.json()
    echoResult.value = data
  } catch (err) {
    console.error('POST echo failed:', err)
  } finally {
    isPosting.value = false
  }
}
</script>

<template>
  <div class="card api-card">
    <div class="card-header">
      <div class="header-left">
        <div class="icon-bubble">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <div>
          <h2 class="card-title">前後端 API 互動沙盒</h2>
          <p class="card-desc">Vue 3 前端發送請求至 Cloudflare Hono 邊緣端點</p>
        </div>
      </div>

      <!-- Latency Badge & Ping Button -->
      <div class="latency-control">
        <div v-if="pingLatency !== null" class="latency-indicator" :class="{
          'speed-fast': pingLatency < 60,
          'speed-medium': pingLatency >= 60 && pingLatency < 180,
          'speed-slow': pingLatency >= 180
        }">
          <span class="speed-dot"></span>
          <span class="font-mono">{{ pingLatency }} ms</span>
        </div>
        <button class="ping-btn" :disabled="isPinging" @click="testPing">
          <svg :class="{ 'animate-spin': isPinging }" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>{{ isPinging ? '測速中...' : '邊緣測速' }}</span>
        </button>
      </div>
    </div>

    <!-- POST API Interaction Section -->
    <div class="tester-section">
      <div class="section-label">
        <span class="method-tag post">POST</span>
        <span class="font-mono endpoint">/api/echo</span>
      </div>

      <div class="input-form">
        <div class="form-row">
          <div class="input-group">
            <label class="input-label">發送者名稱</label>
            <input v-model="postSender" type="text" class="custom-input" placeholder="例如：Alex" />
          </div>
          <div class="input-group flex-2">
            <label class="input-label">傳送訊息 (Payload)</label>
            <input
              v-model="postMessage"
              type="text"
              class="custom-input"
              placeholder="輸入欲發送至邊緣伺服器的文字..."
              @keyup.enter="sendEcho"
            />
          </div>
          <div class="input-group-action">
            <label class="input-label opacity-0">動作</label>
            <button class="send-btn" :disabled="isPosting" @click="sendEcho">
              <svg v-if="!isPosting" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              <span v-else class="animate-spin inline-spinner"></span>
              <span>發送請求</span>
            </button>
          </div>
        </div>
      </div>

      <!-- JSON Response Display -->
      <div v-if="echoResult" class="response-viewer animate-fade-in">
        <div class="viewer-header">
          <span class="viewer-title">邊緣伺服器 JSON 響應 (200 OK)</span>
          <span class="font-mono viewer-time">{{ echoResult.processedAt }}</span>
        </div>
        <pre class="json-code font-mono">{{ JSON.stringify(echoResult, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--bg-card);
  backdrop-filter: var(--backdrop-filter);
  -webkit-backdrop-filter: var(--backdrop-filter);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
}

.card:hover {
  border-color: var(--border-glow);
  box-shadow: var(--shadow-glow);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.icon-bubble {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: var(--cf-gradient-soft);
  color: var(--cf-orange);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(243, 128, 32, 0.2);
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.card-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.latency-control {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.latency-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-full);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.speed-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.speed-fast {
  color: var(--color-success);
  border-color: rgba(16, 185, 129, 0.3);
}
.speed-fast .speed-dot {
  background-color: var(--color-success);
}

.speed-medium {
  color: var(--color-warning);
  border-color: rgba(245, 158, 11, 0.3);
}
.speed-medium .speed-dot {
  background-color: var(--color-warning);
}

.speed-slow {
  color: var(--color-error);
  border-color: rgba(239, 68, 68, 0.3);
}
.speed-slow .speed-dot {
  background-color: var(--color-error);
}

.ping-btn {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.ping-btn:hover:not(:disabled) {
  border-color: var(--cf-orange);
  color: var(--cf-orange);
  transform: translateY(-1px);
}

.tester-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.method-tag {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}

.method-tag.post {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.endpoint {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.form-row {
  display: flex;
  gap: 0.85rem;
  align-items: flex-end;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.flex-2 {
  flex: 2;
}

.input-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.opacity-0 {
  opacity: 0;
}

.custom-input {
  width: 100%;
  padding: 0.65rem 0.95rem;
  border-radius: var(--radius-md);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.88rem;
  transition: border-color var(--transition-fast);
}

.custom-input:focus {
  outline: none;
  border-color: var(--cf-orange);
  box-shadow: 0 0 0 3px var(--cf-orange-glow);
}

.send-btn {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.68rem 1.25rem;
  border-radius: var(--radius-md);
  background: var(--cf-gradient);
  color: #ffffff;
  font-weight: 600;
  font-size: 0.88rem;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 10px rgba(243, 128, 32, 0.35);
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.inline-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
}

.response-viewer {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.viewer-title {
  color: var(--color-success);
  font-weight: 600;
}

.json-code {
  font-size: 0.82rem;
  color: var(--text-primary);
  line-height: 1.5;
  overflow-x: auto;
  margin: 0;
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
    align-items: stretch;
  }
  .opacity-0 {
    display: none;
  }
}
</style>
