<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { D1DemoResponse } from '../types/api'

const demoData = ref<D1DemoResponse | null>(null)
const isLoading = ref(false)
const showInstructions = ref(true)

const fetchD1Demo = async () => {
  isLoading.value = true
  try {
    const res = await fetch('/api/d1-demo')
    if (res.ok) {
      demoData.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to fetch D1 demo:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchD1Demo()
})
</script>

<template>
  <div class="card d1-card">
    <div class="card-header">
      <div class="header-left">
        <div class="icon-bubble">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
        </div>
        <div>
          <div class="title-with-pill">
            <h2 class="card-title">Cloudflare D1 邊緣資料庫範例</h2>
            <span class="status-badge" :class="demoData?.isBound ? 'bound' : 'preview'">
              {{ demoData?.isBound ? 'D1 資料庫已啟用' : '展示範例模式' }}
            </span>
          </div>
          <p class="card-desc">示範於 Cloudflare Workers 存取全球分散式 SQLite SQL 資料庫</p>
        </div>
      </div>

      <button class="toggle-guide-btn" @click="showInstructions = !showInstructions">
        <span>{{ showInstructions ? '收合啟用指南' : '展開啟用指南' }}</span>
        <svg :class="{ 'rotate-180': showInstructions }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>

    <!-- D1 Setup Instructions Accordion -->
    <div v-show="showInstructions" class="instructions-panel animate-fade-in">
      <div class="panel-badge">3 步驟啟用真實 D1 資料庫</div>
      <ol class="steps-list">
        <li>
          <span class="step-num">1</span>
          <div class="step-content">
            <p>在專案終端機執行指令建立 D1 資料庫：</p>
            <code class="code-box font-mono">pnpm exec wrangler d1 create cf-first-db</code>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div class="step-content">
            <p>打開專案根目錄的 <span class="font-mono highlight-file">wrangler.jsonc</span>，取消註解 <code class="font-mono">d1_databases</code> 並填入產生的 <code class="font-mono">database_id</code>。</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div class="step-content">
            <p>至 <span class="font-mono highlight-file">server/db-example.ts</span> 取消 SQL 查詢註解，即可於 Hono 中直接使用 <code class="font-mono">c.env.DB</code>！</p>
          </div>
        </li>
      </ol>
    </div>

    <!-- Sample Records Display -->
    <div class="records-wrapper">
      <div class="records-header">
        <span class="records-title">查詢結果預覽 (Mock / Real D1 Results)</span>
        <button class="refresh-sub-btn" :disabled="isLoading" @click="fetchD1Demo">
          <svg :class="{ 'animate-spin': isLoading }" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>重新查詢</span>
        </button>
      </div>

      <div class="items-list">
        <div v-for="item in demoData?.items" :key="item.id" class="item-card">
          <div class="item-id font-mono">#{{ item.id }}</div>
          <div class="item-title">{{ item.title }}</div>
          <div class="item-time font-mono">{{ new Date(item.created_at).toLocaleTimeString() }}</div>
        </div>
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

.title-with-pill {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.status-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.status-badge.preview {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-badge.bound {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.card-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.toggle-guide-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  transition: all var(--transition-fast);
}

.toggle-guide-btn:hover {
  color: var(--cf-orange);
  border-color: var(--cf-orange);
}

.rotate-180 {
  transform: rotate(180deg);
}

.instructions-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}

.panel-badge {
  display: inline-block;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--cf-orange);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
}

.steps-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.steps-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--cf-gradient-soft);
  color: var(--cf-orange);
  border: 1px solid rgba(243, 128, 32, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.code-box {
  display: inline-block;
  margin-top: 0.35rem;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-sm);
  color: var(--cf-amber);
  font-size: 0.82rem;
}

.highlight-file {
  color: var(--cf-orange);
  font-weight: 600;
}

.records-wrapper {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}

.records-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
}

.records-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.refresh-sub-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  transition: color var(--transition-fast);
}

.refresh-sub-btn:hover:not(:disabled) {
  color: var(--cf-orange);
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.65rem 0.95rem;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  transition: all var(--transition-fast);
}

.item-card:hover {
  border-color: rgba(243, 128, 32, 0.25);
  transform: translateX(3px);
}

.item-id {
  font-weight: 700;
  color: var(--cf-orange);
  font-size: 0.8rem;
}

.item-title {
  flex: 1;
  color: var(--text-primary);
}

.item-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
