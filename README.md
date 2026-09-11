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

# 產出安全隨機 APP_KEY 並同步寫入 .env 與 .dev.vars (可加 --show 僅顯示不寫入)
pnpm ace generate:key

# 產出安全隨機 JWT_SECRET 並同步寫入 .env 與 .dev.vars
pnpm ace generate:jwt-secret

# 一次產出 APP_KEY 與 JWT_SECRET (或使用 pnpm ace generate:key --jwt)
pnpm ace generate:secrets

# 掃描並執行資料庫遷移 (加 --remote 可套用至線上 Cloudflare D1)
pnpm ace migration:run
pnpm ace migration:run --remote

# 執行資料庫種子填充腳本 (加 --remote 可寫入線上 Cloudflare D1)
pnpm ace db:seed
pnpm ace db:seed --remote

# 從線上 Cloudflare D1 拉取最新資料並同步至本機 SQLite (tmp/db.sqlite)
pnpm ace db:pull
```

---

## 🚀 本地開發與測試

### 1. 安裝依賴套件
```bash
pnpm install
```

### 2. 啟動本機開發環境
* **標準本地模式（使用本機 SQLite，推薦）**：
  ```bash
  pnpm run dev
  ```
* **線上直連模式（本機前端/後端直連 Cloudflare 線上真實 D1）**：
  ```bash
  pnpm run dev:remote
  ```
開啟瀏覽器訪問 `http://localhost:5173`，打開 **DevTools (F12) -> Console**，點擊按鈕即可測試各項 API。

### 3. 執行後端全自動整合測試
專案內建 30 項 API 功能整合測試（涵蓋 Auth Token、422 驗證、CRUD、Resource、Transaction 隔離等級與 forUpdate、批次寫入、Macro 與 Exception Handler）：
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

## 🔏 資料庫事務 (Transaction)、隔離等級 (Isolation Level) 與悲觀鎖 (forUpdate)

本專案支援媲美 AdonisJS 7 / Lucid 的交易管理與鎖定機制，並為 Cloudflare D1 (SQLite) 與遠端 MySQL / PostgreSQL 做了底層方言自動適配。

### 1. 事務與隔離等級 (`isolationLevel`)

呼叫 `Database.transaction(callback, options)` 時，可傳入 `{ isolationLevel }` 設定交易隔離層級：

```ts
import { Database } from '../core/database'

const result = await Database.transaction(async (trx) => {
  // 透過 Model 進行操作 (綁定 trx)
  const firstNote = await Note.query({ client: trx }).insert({
    user_id: 1,
    title: '事務筆記 A',
    content: '第一筆成功寫入'
  })

  // 透過鏈式 useTransaction(trx) 進行操作
  const secondNote = await Note.query().useTransaction(trx).insert({
    user_id: 1,
    title: '事務筆記 B',
    content: '第二筆成功寫入'
  })

  // 亦可直接透過 trx.from()
  // await trx.from('notes').insert({ ... })

  return { firstNote, secondNote }
}, {
  // 支援 4 種標準隔離等級：
  // 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' (預設)
  isolationLevel: 'serializable'
})
```

#### 💡 方言適配說明：
* **MySQL / PostgreSQL**：自動於交易開始時執行 `SET TRANSACTION ISOLATION LEVEL <LEVEL>`。
* **Cloudflare D1 (SQLite)**：SQLite 預設運作於 Serializable 隔離等級；系統會將該等級綁定於 `trx.isolationLevel` 供邏輯存取，同時維護交易快照以實現安全 Rollback。

---

### 2. 悲觀排他鎖 (`forUpdate`) 與共享鎖 (`forShare`)

在查詢鏈上呼叫 `.forUpdate()` 或 `.forShare()` 即可鎖定特定記錄：

```ts
await Database.transaction(async (trx) => {
  // 1. Model 查詢排他鎖 (FOR UPDATE)
  const lockedNote = await Note.query({ client: trx })
    .where('id', 1)
    .forUpdate()
    .first()

  // 2. QueryBuilder 排他鎖 (FOR UPDATE)
  const rawLocked = await trx.from('notes')
    .where('id', 1)
    .forUpdate()
    .first()

  // 3. 指定鎖定表 (FOR UPDATE OF notes)
  const tableLocked = await trx.from('notes')
    .forUpdate('notes')
    .first()

  // 4. 共享鎖 (FOR SHARE)
  const sharedLocked = await trx.from('notes')
    .forShare()
    .first()
})
```

#### 💡 方言適配說明：
* **MySQL / PostgreSQL**：編譯出原生 `SELECT ... FOR UPDATE` 或 `FOR SHARE` SQL 語句。
* **Cloudflare D1 (SQLite) / 記憶體模式**：因 SQLite 不支援 `FOR UPDATE` 語法，QueryBuilder 會**自動安全略過語法拼接**（避免拋出 SQLite 語法錯誤），同時在查詢物件上保留鎖狀態旗標 `getLockMode()`。

---

### 3. QueryBuilder & Model 批次寫入與更新

除了單筆操作外，系統完整支援批次與條件更新操作：

```ts
// 1. 批次多筆插入 (回傳多筆包含遞增 ID 的陣列)
const batchNotes = await Database.from('notes').insert([
  { user_id: 1, title: '批次筆記 1', content: '內容 1' },
  { user_id: 1, title: '批次筆記 2', content: '內容 2' }
])

// 2. 條件批次更新 (自動更新 updated_at，回傳受影響筆數 number)
const updatedCount = await Note.query()
  .where('user_id', 1)
  .update({ content: '全面更新內容' })

// 3. 條件批次刪除 (回傳受影響筆數 number)
const deletedCount = await Note.query()
  .where('is_archived', true)
  .delete()

// 4. Model 批次實例建立 (觸發 before/afterCreate 等生命週期 Hooks)
const createdModels = await Note.createMany([
  { user_id: 1, title: '模型筆記 1', content: '內容 1' },
  { user_id: 1, title: '模型筆記 2', content: '內容 2' }
])
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
