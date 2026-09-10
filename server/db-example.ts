/**
 * Cloudflare D1 資料庫操作範例模組
 *
 * Cloudflare D1 是基於 SQLite 的全球分散式無伺服器 SQL 資料庫。
 *
 * 啟用步驟：
 * 1. 在終端機執行建立資料庫：
 *    pnpm exec wrangler d1 create my-database
 *
 * 2. 於 wrangler.jsonc 中加入 (取消註解)：
 *    "d1_databases": [
 *      {
 *        "binding": "DB",
 *        "database_name": "my-database",
 *        "database_id": "<你的 database_id>"
 *      }
 *    ]
 *
 * 3. 建立資料表 (SQL Schema)：
 *    pnpm exec wrangler d1 execute my-database --command "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
 *
 * 4. 於本機測試時：
 *    pnpm exec wrangler d1 execute my-database --local --command "SELECT * FROM notes;"
 */

export interface NoteItem {
  id: number
  title: string
  created_at: string
}

export interface D1DemoResponse {
  isBound: boolean
  message: string
  instructions?: string[]
  items: NoteItem[]
}

// 定義 Worker 的環境綁定型別
export interface Env {
  // 當在 wrangler.jsonc 設定了 d1_databases 且 binding 名稱為 DB 時：
  DB?: D1Database
}

/**
 * 示範查詢 D1 資料庫的函式
 */
export async function getD1NotesDemo(env: Env): Promise<D1DemoResponse> {
  // 檢查是否已綁定 D1 資料庫
  if (env.DB) {
    try {
      // ==========================================
      // 【真實 D1 SQL 查詢範例】
      // ==========================================
      // const { results } = await env.DB.prepare(
      //   'SELECT id, title, created_at FROM notes ORDER BY id DESC LIMIT 5'
      // ).all<NoteItem>()

      // return {
      //   isBound: true,
      //   message: '已成功從真實 Cloudflare D1 資料庫讀取資料！',
      //   items: results || []
      // }

      // 預防尚未建立 notes 資料表的防呆範例：
      const { results } = await env.DB.prepare(
        "SELECT 1 as id, 'D1 連線成功！' as title, datetime('now') as created_at"
      ).all<NoteItem>()

      return {
        isBound: true,
        message: '已成功與 Cloudflare D1 建立連線並執行 SQL 測試查詢！',
        items: results as NoteItem[]
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return {
        isBound: true,
        message: `D1 連線已啟用，但查詢出錯（可能尚未建立資料表）：${errorMessage}`,
        items: []
      }
    }
  }

  // 若尚未在 wrangler.jsonc 綁定 D1，回傳友善教學與模擬資料
  return {
    isBound: false,
    message: '目前處於展示模式（未綁定真實 D1 資料庫）。若要連接真實 D1，請參考下方步驟！',
    instructions: [
      '1. 終端機執行: pnpm exec wrangler d1 create cf-first-db',
      '2. 將產生的 database_id 複製至 wrangler.jsonc 的 d1_databases 欄位',
      '3. 取消 server/db-example.ts 內的真實查詢註解，即可享有 Edge SQL 儲存功能！'
    ],
    items: [
      { id: 1, title: '【範例待辦 1】探索 Cloudflare Workers 邊緣運算', created_at: new Date().toISOString() },
      { id: 2, title: '【範例待辦 2】體驗 Vue 3 響應式介面與 Hono API 整合', created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 3, title: '【範例待辦 3】於 wrangler.jsonc 啟用 D1 資料庫綁定', created_at: new Date(Date.now() - 7200000).toISOString() }
    ]
  }
}
