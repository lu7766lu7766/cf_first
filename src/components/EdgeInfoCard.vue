<script setup lang="ts">
import { ref } from 'vue'
import type { EdgeInfoResponse } from '../types/api'

const props = defineProps<{
  edgeInfo: EdgeInfoResponse | null
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const copiedRay = ref(false)

const copyRayId = async (rayId?: string) => {
  if (!rayId) return
  try {
    await navigator.clipboard.writeText(rayId)
    copiedRay.value = true
    setTimeout(() => {
      copiedRay.value = false
    }, 2000)
  } catch {
    // clipboard fallback
  }
}
</script>

<template>
  <div class="card edge-card">
    <div class="card-header">
      <div class="header-left">
        <div class="icon-bubble">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </div>
        <div>
          <h2 class="card-title">Cloudflare 邊緣節點檢測</h2>
          <p class="card-desc">展示您的請求正由全球哪個 Anycast 邊緣機房處理</p>
        </div>
      </div>
      <button class="refresh-btn" :disabled="props.loading" @click="emit('refresh')" title="重新獲取節點數據">
        <svg :class="{ 'animate-spin': props.loading }" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>刷新節點</span>
      </button>
    </div>

    <div v-if="props.edgeInfo" class="edge-grid">
      <!-- Colo 數據中心代碼 -->
      <div class="data-item highlight">
        <span class="data-label">邊緣機房 (Colo)</span>
        <div class="data-value-wrapper">
          <span class="colo-badge font-mono">{{ props.edgeInfo.colo }}</span>
          <span class="data-sub">{{ props.edgeInfo.city }}, {{ props.edgeInfo.country }}</span>
        </div>
      </div>

      <!-- 客戶端 IP -->
      <div class="data-item">
        <span class="data-label">訪客 IP (Connecting IP)</span>
        <div class="data-value font-mono">{{ props.edgeInfo.clientIp }}</div>
        <span class="data-sub">經由 Cloudflare 安全代理</span>
      </div>

      <!-- Ray ID -->
      <div class="data-item">
        <div class="label-with-action">
          <span class="data-label">CF Ray ID (請求追蹤碼)</span>
          <button class="copy-btn" @click="copyRayId(props.edgeInfo?.rayId)">
            {{ copiedRay ? '已複製 ✓' : '複製' }}
          </button>
        </div>
        <div class="data-value font-mono text-truncate">{{ props.edgeInfo.rayId }}</div>
        <span class="data-sub">每個請求的全球唯一識別碼</span>
      </div>

      <!-- 網路協議與安全協定 -->
      <div class="data-item">
        <span class="data-label">傳輸協定與加密</span>
        <div class="data-value font-mono">
          {{ props.edgeInfo.httpProtocol }} / {{ props.edgeInfo.tlsVersion }}
        </div>
        <span class="data-sub">ASN: {{ props.edgeInfo.asn }} ({{ props.edgeInfo.asOrganization }})</span>
      </div>
    </div>

    <div v-else class="loading-placeholder">
      <div class="loading-spinner animate-spin"></div>
      <p>正在連接 Cloudflare 邊緣網路...</p>
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

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.95rem;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
  border-color: var(--cf-orange);
  color: var(--cf-orange);
  transform: translateY(-1px);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.edge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.data-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: all var(--transition-fast);
}

.data-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.data-item.highlight {
  border-color: rgba(243, 128, 32, 0.4);
  background: var(--cf-gradient-soft);
}

.data-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-btn {
  font-size: 0.72rem;
  color: var(--cf-orange);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-badge);
  transition: background var(--transition-fast);
}

.copy-btn:hover {
  background: rgba(243, 128, 32, 0.2);
}

.data-value {
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--text-primary);
}

.data-value-wrapper {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.colo-badge {
  font-size: 1.35rem;
  font-weight: 800;
  background: var(--cf-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.data-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 1rem;
  color: var(--text-muted);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--cf-orange);
  border-radius: 50%;
}
</style>
