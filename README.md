# Cloudflare Edge + AdonisJS 7 API 風格全端範本 (Hono + Vue 3)

這是一個將 **Hono** 實踐為極致接近 **AdonisJS 7 開發體驗** 的現代化邊緣全端專案。
後端提供 Class-based Controller、Active Record ORM、IoC 依賴注入、VineJS 驗證器、多 Guard 認證與專屬 Ace CLI；前端則徹底極簡化為純功能性 API 測試面板，方便開發者直接在瀏覽器 DevTools 中檢驗各項端點輸出。

---

## ✨ 特色亮點

- **🎯 AdonisJS 7 路由與群組體驗**：支援 Tuple 路由 `router.get('/path', [Controller, 'action'])`、RESTful `router.resource()` 與鏈式路由群組 `router.group(() => { ... }).prefix('/api').use([...])`，支援多層巢狀群組。
- **✨ 統一 API 格式化中介層 (`ApiFormatMiddleware`)**：Controller 可直接回傳物件或呼叫 `ctx.response.json()`，中介層自動統一封裝為 `{ code: [0], data: ..., time: '... ms' }` 格式，並統整例外錯誤處理。
- **🧩 IoC Container 與依賴注入**：支援 `@inject()` 裝飾器，Controller 建構子可自動解析注入 Service 或 Repository。
- **📦 Active Record BaseModel**：提供熟悉的 Lucid ORM 語法（`Model.all()`, `Model.find()`, `Model.create()`, `model.save()`, `model.delete()` 與生命週期 Hooks）。
- **🗄️ 多資料庫連線驅動與事務 (Transaction)**：
  - 統一於 `server/config/database.ts` 配置連線，預設相容 Cloudflare D1 (SQLite)，並支援外聯 PostgreSQL、MySQL。
  - 提供 `Database.transaction(async (trx) => { ... })` 自動提交與異常復原。
- **🛡️ VineJS + Class Validator 驗證**：底層整合 Adonis 官方極速 `@vinejs/vine`，應用層提供 Class DTO 與 `@field()` 裝飾器，驗證失敗自動格式化為 HTTP 422 錯誤。
- **🔐 多 Guard 身分驗證系統**：支援無狀態 `jwt` Guard（Edge 原生 Web Crypto）與 `tokens` (Opaque Access Tokens) Guard，搭配 `authMiddleware()` 保護特定路由。
- **🚨 集中式例外處理器 (Exception Handler)**：繼承 `HttpExceptionHandler`，標準化捕獲並回傳 `HttpException`、`ValidationException` 與 `AuthenticationException`。
- **🪄 Macroable 巨集擴充**：支援動態在 Response 與 HttpContext 掛載自訂方法（如 `ctx.response.apiSuccess()`）。
- **⚡️ 專屬 Ace CLI 工具 (`pnpm ace`)**：提供如同 Adonis `node ace` 的代碼生成器與資料庫指令。
- **🖥️ 極簡 DevTools 測試前端**：移除多餘 CSS 修飾，只保留純功能性按鈕，將 API 結果直接同步至 Console 與畫面預覽。

---

## 📁 專案目錄結構

```
cf_first/
├── package.json                 # 依賴套件與 scripts (包含 pnpm ace)
├── tsconfig.json                # TypeScript 全域配置
├── tsconfig.server.json         # 後端 TypeScript 配置 (含 Decorators)
├── vite.config.ts               # Vite 設定 (反向代理 /api 至後端)
├── wrangler.jsonc               # Cloudflare Workers + Static Assets 部署配置
├── src/                         # 極簡化測試前端
│   ├── App.vue                  # 10 個核心 API 測試按鈕面板
│   └── main.ts                  # Vue 3 入口點
└── server/                      # AdonisJS 7 風格後端引擎
    ├── ace.ts                   # Ace CLI 命令列入口點 (pnpm ace)
    ├── index.ts                 # Hono 伺服器主入口點
    ├── core/                    # AdonisJS 核心框架膠水層
    │   ├── kernel.ts            # HttpKernel (全域與具名中介層管線註冊與解析)
    │   ├── router.ts            # AdonisRouter, Resource 與 Hono 橋接
    │   ├── container.ts         # IoC 容器與 @inject 裝飾器
    │   ├── context.ts           # HttpContext 建立 (request, response, auth)
    │   ├── model.ts             # Lucid Active Record BaseModel
    │   ├── database.ts          # DatabaseManager, QueryBuilder, Transaction
    │   ├── validator.ts         # VineJS + ClassValidator 裝飾器
    │   ├── auth.ts              # AuthManager (JWT & Token Guards)
    │   ├── exception_handler.ts # HttpException 與錯誤處理基底
    │   ├── macro.ts             # Macroable 巨集擴充機制
    │   └── types.ts             # 核心型別定義
    ├── config/                  # 設定模組
    │   ├── database.ts          # 資料庫連線配置 (D1 / SQLite / PG / MySQL)
    │   ├── cors.ts              # CORS 跨來源資源共用設定
    │   ├── auth.ts              # Auth Guards 設定
    │   └── body_parser.ts       # Body Parser 解析器配置 (JSON, Form, Multipart)
    ├── app/                     # 業務邏輯層
    │   ├── controllers/         # AuthController, NotesController
    │   ├── models/              # User, Note
    │   ├── middleware/          # auth_middleware, api_format_middleware
    │   ├── validators/          # RegisterValidator, CreateNoteValidator
    │   ├── exceptions/          # handler.ts (AppExceptionHandler)
    │   └── services/            # NotesService (示範 @inject 依賴注入)
    ├── database/                # 資料庫遷移與種子
    │   ├── migrations/          # SQL 結構遷移檔案
    │   └── seeders/             # main_seeder.ts 種子腳本
    └── start/                   # 啟動註冊
        ├── kernel.ts            # HttpKernel 全域/具名中介層與 Macro 註冊
        └── routes.ts            # Adonis 風格路由定義
```

---

## 🛠️ Ace CLI 指令指南

專案已內建專屬的 `ace` CLI，可在終端機中執行：

```bash
# 查看所有可用指令與說明
pnpm ace --help

# 建立新 Controller
pnpm ace make:controller Users

# 建立新 Active Record Model
pnpm ace make:model Product

# 建立新 Middleware
pnpm ace make:middleware Log

# 建立新 VineJS Class Validator
pnpm ace make:validator Product

# 建立新 SQL 遷移檔
pnpm ace make:migration create_products_table

# 建立新 Seeder 種子腳本
pnpm ace make:seeder Product

# 掃描並執行資料庫遷移
pnpm ace migration:run

# 執行資料庫種子填充腳本
pnpm ace db:seed
```

---

## 🚀 本地開發與測試

### 1. 安裝依賴套件
```bash
pnpm install
```

### 2. 啟動本機開發環境
同時啟動前端 Vite (Port 5173) 與後端 Cloudflare Worker 模擬器 (Port 8787)：
```bash
pnpm run dev
```
開啟瀏覽器訪問 `http://localhost:5173`，打開 **DevTools (F12) -> Console**，點擊按鈕即可測試各項 API。

### 3. 執行後端全自動整合測試
專案內建 13 項 API 功能整合測試（涵蓋 Auth Token、422 驗證、CRUD、Resource、Transaction、Macro 與 Exception Handler）：
```bash
pnpm exec tsx server/test-endpoints.ts
```

### 4. 靜態型別檢查與生產打包
```bash
# 前後端 TypeScript 型別檢查
pnpm run type-check

# 打包生產版本
pnpm run build
```

---

## 🗄️ 資料庫設定說明 (`server/config/database.ts`)

本專案支援彈性配置不同資料庫連線：

1. **預設連線 (Cloudflare D1)**：
   本機開發或未綁定真實 D1 時，系統具備智慧 Fallback 機制確保 API 不中斷。
   若要綁定真實 Cloudflare D1：
   - 於終端機執行：`pnpm exec wrangler d1 create <db-name>`
   - 在 `wrangler.jsonc` 中填入 `database_id`
   - 透過 `pnpm ace migration:run` 套用遷移 SQL。

2. **外聯資料庫 (PostgreSQL / MySQL / SQLite)**：
   可直接於 `server/config/database.ts` 配置外部資料庫連線字串或切換 `Database.connection('postgres')`，適用於透過 Cloudflare Hyperdrive 或遠端 Serverless DB 連線。

---

## ☁️ 部署至 Cloudflare

執行一鍵打包與發布指令：
```bash
pnpm run deploy
```
Wrangler 會自動編譯 Vue 前端靜態檔案，並將掛載 AdonisJS 7 引擎的 Hono Worker 一體化部署至 Cloudflare 全球 330+ 邊緣節點！
