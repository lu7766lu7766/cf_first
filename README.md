# Cloudflare Edge 全端起手式範本 (Vue 3 + Hono + Workers Static Assets)

這是一個為 Cloudflare 打造的現代化全端網站起手式範本。
採用 **Vue 3 (Vite)** 作為前端單頁應用 (SPA)，以 **Hono** 作為 Cloudflare Edge Worker 後端，並透過 Cloudflare 官方最新的一體化 **Workers + Static Assets** (`wrangler.jsonc`) 架構進行託管與部署。

---

## ✨ 特色亮點

- **⚡️ 零冷啟動與極速響應**：基於 Cloudflare Workers V8 Isolate 與全球 Anycast 網路。
- **🌐 邊緣資訊即時檢測**：自動偵測並展示 Cloudflare 機房節點代碼 (Colo)、訪客 IP、地理位置與 Ray-ID。
- **🔗 前後端完整打通**：內建 GET 健康檢查、POST 資料回傳 (Echo) 以及即時邊緣往返延遲 (Ping) 測速。
- **💾 Cloudflare D1 資料庫支援**：預先寫好邊緣 SQLite 資料庫連線範例程式與詳細教學（預設備註，隨時啟用）。
- **🎨 精緻科技感介面**：經典 Cloudflare 橘黑科技配色、毛玻璃質感卡片、微動畫與深淺色主題 (Dark / Light) 切換。
- **🛡️ 全端 TypeScript**：前後端享有一致的型別檢查與程式碼提示。

---

## 📁 專案目錄架構

```
cf_first/
├── index.html                   # HTML 入口
├── package.json                 # 依賴套件與 scripts
├── tsconfig.json                # 前端 TypeScript 配置
├── tsconfig.server.json         # 後端 TypeScript 配置
├── vite.config.ts               # Vite 設定（開發模式代理 /api 至 Wrangler）
├── wrangler.jsonc               # Cloudflare Workers + Static Assets 部署配置
├── public/
│   └── favicon.svg              # 專屬 Favicon
├── src/                         # Vue 3 前端程式碼
│   ├── assets/
│   │   └── main.css             # 全域樣式、CSS 變數、主題 Token
│   ├── components/
│   │   ├── HeaderNav.vue        # 導航列、狀態指示燈、深淺色切換開關
│   │   ├── EdgeInfoCard.vue     # 邊緣機房與訪客網路檢測卡片
│   │   ├── ApiTesterCard.vue    # 前後端 API 互動測試面板與延遲測速
│   │   └── DatabaseDemoCard.vue # D1 資料庫展示與啟用指引卡片
│   ├── types/
│   │   └── api.ts               # 前後端共享型別定義
│   ├── App.vue                  # 主畫面排版
│   └── main.ts                  # Vue 入口點
└── server/                      # Hono 後端程式碼
    ├── index.ts                 # Hono API 路由定義
    └── db-example.ts            # D1 查詢示範與環境變數定義
```

---

## 🚀 快速開始

### 1. 安裝依賴
```bash
pnpm install
```

### 2. 啟動本地開發環境
同時啟動前端 Vite 開發伺服器與後端 Wrangler 邊緣模擬器：
```bash
pnpm dev
```
- 前端網址：`http://localhost:5173`
- 後端 API：`http://localhost:8787`（Vite 已設定自動將 `/api/*` 請求代理至後端）

### 3. 型別檢查與打包
```bash
# 檢查前後端 TypeScript 型別
pnpm run type-check

# 打包前端至 dist/
pnpm run build
```

### 4. 本地預覽生產打包版本
```bash
pnpm run preview
```

---

## ☁️ 部署至 Cloudflare

### 步驟 1：登入 Cloudflare 帳號
若是第一次在電腦上使用 Wrangler，請先登入：
```bash
pnpm exec wrangler login
```
瀏覽器會自動開啟，點擊「授權 (Allow)」即可完成登入。

### 步驟 2：執行一鍵部署
```bash
pnpm run deploy
```
Wrangler 會自動完成打包並將靜態前端與 Hono Worker 上傳至您的 Cloudflare 帳號，並輸出一個專屬的網址（例如：`https://cf-first.<你的帳號>.workers.dev`）！

---

## 🗄️ 啟用 Cloudflare D1 關聯式資料庫（選用）

本專案已在 `server/db-example.ts` 與 `wrangler.jsonc` 中備妥完整的 D1 資料庫連線範例。若想啟用真實 SQL 資料庫：

1. **建立資料庫**：
   ```bash
   pnpm exec wrangler d1 create cf-first-db
   ```
2. **填入配置**：
   開啟 `wrangler.jsonc`，取消下方 `d1_databases` 的註解，並將剛建立的 `database_id` 貼入：
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "cf-first-db",
       "database_id": "<你的 database_id>"
     }
   ]
   ```
3. **啟用查詢**：
   開啟 `server/db-example.ts`，將 `env.DB.prepare(...)` 的 SQL 查詢取消註解，重新執行 `pnpm run deploy` 即可！
