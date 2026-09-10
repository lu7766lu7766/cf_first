<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  isOnline: boolean
  runtimeName: string
}>()

const isDark = ref(true)

const toggleTheme = () => {
  isDark.value = !isDark.value
  const theme = isDark.value ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('cf_theme', theme)
}

onMounted(() => {
  const saved = localStorage.getItem('cf_theme')
  if (saved) {
    isDark.value = saved === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
})
</script>

<template>
  <header class="header-nav">
    <div class="nav-container">
      <!-- Brand Logo -->
      <div class="brand">
        <div class="logo-icon">
          <svg viewBox="0 0 48 48" width="28" height="28">
            <path
              d="M33 32H15a6 6 0 0 1-2.4-11.5 8 8 0 0 1 15-4.2A7 7 0 0 1 33 32z"
              fill="url(#nav-grad)"
            />
            <circle cx="34" cy="28" r="4" fill="#FAAD3F" />
            <defs>
              <linearGradient id="nav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#F38020" />
                <stop offset="100%" stop-color="#FAAD3F" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="brand-text">
          <div class="brand-title">
            <span>CF First</span>
            <span class="version-tag">Workers + Vue</span>
          </div>
          <div class="brand-subtitle">Cloudflare Edge 全端起手式</div>
        </div>
      </div>

      <!-- Right Controls: Status & Theme Toggle -->
      <div class="nav-actions">
        <!-- Live Edge Status Pill -->
        <div class="status-pill" :class="{ online: props.isOnline }">
          <span class="status-dot"></span>
          <span class="status-label">{{ props.isOnline ? props.runtimeName || 'Edge Online' : 'Connecting...' }}</span>
        </div>

        <!-- Dark / Light Mode Toggle Button -->
        <button
          class="theme-toggle-btn"
          @click="toggleTheme"
          :title="isDark ? '切換至淺色模式' : '切換至深色模式'"
          aria-label="切換外觀主題"
        >
          <span v-if="isDark" class="theme-icon">☀️</span>
          <span v-else class="theme-icon">🌙</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-card);
  backdrop-filter: var(--backdrop-filter);
  -webkit-backdrop-filter: var(--backdrop-filter);
  border-bottom: 1px solid var(--border-color);
  transition: all var(--transition-normal);
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.85rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}

.version-tag {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--cf-gradient-soft);
  color: var(--cf-orange);
  border: 1px solid rgba(243, 128, 32, 0.25);
  text-transform: uppercase;
}

.brand-subtitle {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius-full);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-muted);
  transition: background-color var(--transition-normal);
}

.status-pill.online .status-dot {
  background-color: var(--color-success);
  animation: pulse-glow 2s infinite;
}

.theme-toggle-btn {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: all var(--transition-fast);
}

.theme-toggle-btn:hover {
  border-color: var(--border-glow);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 640px) {
  .brand-subtitle,
  .version-tag {
    display: none;
  }
}
</style>
