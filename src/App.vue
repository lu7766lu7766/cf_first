<script setup lang="ts">
import { ref, onMounted } from 'vue'
import HeaderNav from './components/HeaderNav.vue'
import EdgeInfoCard from './components/EdgeInfoCard.vue'
import ApiTesterCard from './components/ApiTesterCard.vue'
import DatabaseDemoCard from './components/DatabaseDemoCard.vue'
import type { EdgeInfoResponse, HealthResponse } from './types/api'

const isOnline = ref(false)
const runtimeName = ref('Cloudflare Edge')
const edgeInfo = ref<EdgeInfoResponse | null>(null)
const loadingEdgeInfo = ref(false)

// 獲取伺服器健康狀態
const checkHealth = async () => {
  try {
    const res = await fetch('/api/health')
    if (res.ok) {
      const data: HealthResponse = await res.json()
      isOnline.value = true
      runtimeName.value = data.runtime || 'Cloudflare Edge'
    }
  } catch (err) {
    console.error('Health check failed:', err)
    isOnline.value = false
  }
}

// 獲取邊緣節點數據
const fetchEdgeInfo = async () => {
  loadingEdgeInfo.value = true
  try {
    const res = await fetch('/api/edge-info')
    if (res.ok) {
      edgeInfo.value = await res.json()
      isOnline.value = true
    }
  } catch (err) {
    console.error('Failed to fetch edge info:', err)
  } finally {
    loadingEdgeInfo.value = false
  }
}

onMounted(() => {
  checkHealth()
  fetchEdgeInfo()
})
</script>

<template>
  <div class="app-layout">
    <!-- Top Navigation -->
    <HeaderNav :is-online="isOnline" :runtime-name="runtimeName" />

    <main class="main-content">
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-badge">
          <span class="badge-icon">🚀</span>
          <span>Cloudflare Workers + Static Assets 官方新標準</span>
        </div>
        <h1 class="hero-title">
          全端極速邊緣網站
          <span class="gradient-text">起手式範本</span>
        </h1>
        <p class="hero-desc">
          前端採用 <strong>Vue 3 (Vite)</strong> 單頁應用，後端由 <strong>Hono</strong> 在全球 330+
          邊緣節點執行。透過單一設定檔 <code class="font-mono hero-code">wrangler.jsonc</code> 即可一鍵秒級部署至 Cloudflare！
        </p>

        <!-- Feature Badges -->
        <div class="feature-badges">
          <div class="f-badge">
            <span class="f-dot"></span>
            <span>⚡️ 0ms 冷啟動 (V8 Isolate)</span>
          </div>
          <div class="f-badge">
            <span class="f-dot"></span>
            <span>🌍 全球 Anycast 邊緣運算</span>
          </div>
          <div class="f-badge">
            <span class="f-dot"></span>
            <span>🛡️ 端到端 TypeScript 型別安全</span>
          </div>
          <div class="f-badge">
            <span class="f-dot"></span>
            <span>📦 一體化前後端整合部署</span>
          </div>
        </div>
      </section>

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- 1. 邊緣資訊卡片 -->
        <EdgeInfoCard
          :edge-info="edgeInfo"
          :loading="loadingEdgeInfo"
          @refresh="fetchEdgeInfo"
        />

        <!-- 2. 前後端 API 測試卡片 -->
        <ApiTesterCard />

        <!-- 3. D1 資料庫範例卡片 -->
        <DatabaseDemoCard />
      </div>

      <!-- Quick Deploy Cheat Sheet Banner -->
      <section class="deploy-banner">
        <div class="banner-inner">
          <div class="banner-text">
            <h3>準備好將專案部署至 Cloudflare 了嗎？</h3>
            <p>只需在終端機登入並執行單一指令，立刻上線至全球邊緣 CDN！</p>
          </div>
          <div class="banner-commands font-mono">
            <div class="cmd-line">
              <span class="cmd-prefix">$</span>
              <span class="cmd-code">pnpm run build</span>
            </div>
            <div class="cmd-line highlight">
              <span class="cmd-prefix">$</span>
              <span class="cmd-code">pnpm run deploy</span>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- App Footer -->
    <footer class="app-footer">
      <div class="footer-container">
        <span>© 2026 Powered by <strong>Hono</strong> & <strong>Vue 3</strong> on <strong>Cloudflare Workers</strong></span>
        <div class="footer-links">
          <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noopener">Workers 文件</a>
          <span class="dot-sep">•</span>
          <a href="https://hono.dev" target="_blank" rel="noopener">Hono 官網</a>
          <span class="dot-sep">•</span>
          <a href="https://vuejs.org" target="_blank" rel="noopener">Vue 3 指南</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}

.main-content {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

/* Hero Section */
.hero-section {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.15rem;
  padding: 1rem 0 0.5rem;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.95rem;
  border-radius: var(--radius-full);
  background: var(--cf-gradient-soft);
  border: 1px solid rgba(243, 128, 32, 0.25);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--cf-orange);
}

.hero-title {
  font-size: clamp(2rem, 4.5vw, 3.2rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.gradient-text {
  background: var(--cf-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-desc {
  max-width: 720px;
  font-size: 1.05rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.hero-code {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--cf-amber);
  font-size: 0.92em;
}

.feature-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.f-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.f-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--cf-orange);
}

/* Dashboard Grid */
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

/* Deploy Cheat Sheet Banner */
.deploy-banner {
  background: var(--cf-gradient-soft);
  border: 1px solid rgba(243, 128, 32, 0.3);
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-sm);
}

.banner-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.banner-text h3 {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.banner-text p {
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.banner-commands {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--bg-app);
  padding: 0.85rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
}

.cmd-line {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.88rem;
}

.cmd-prefix {
  color: var(--text-muted);
  user-select: none;
}

.cmd-code {
  color: var(--text-primary);
}

.cmd-line.highlight .cmd-code {
  color: var(--cf-orange);
  font-weight: 700;
}

/* Footer */
.app-footer {
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 1.5rem 0;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.footer-links a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.footer-links a:hover {
  color: var(--cf-orange);
}

.dot-sep {
  color: var(--border-color);
}

@media (max-width: 768px) {
  .banner-inner {
    flex-direction: column;
    align-items: stretch;
  }
  .footer-container {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}
</style>
