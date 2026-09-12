import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Bindings {
  DB: D1Database
  [key: string]: any
}

interface NoteRow {
  id: number
  user_id: number
  title: string
  content: string
  created_at: string
  updated_at: string
  u_id: number | null
  u_username: string | null
  u_email: string | null
  u_full_name: string | null
  u_created_at: string | null
  u_updated_at: string | null
}

const app = new Hono<{ Bindings: Bindings }>()

// 基礎 CORS 支援
app.use('*', cors())

// 健康檢查路由
app.get('/api/health', (c) => {
  return c.json({
    status: 'online',
    framework: 'Clean Pure Hono',
    runtime: 'Cloudflare Workers (Edge)'
  })
})

// 純原生 Hono + D1 查詢筆記列表（含 LEFT JOIN 使用者關聯）
app.get('/api/notes', async (c) => {
  const start = Date.now()

  try {
    if (!c.env.DB) {
      return c.json({
        code: [500],
        error: 'D1 Database binding (DB) is not available',
        time: `${Date.now() - start} ms`
      }, 500)
    }

    // 直接使用原生 D1 執行單次高效 SQL 查詢
    const query = `
      SELECT 
        n.id,
        n.user_id,
        n.title,
        n.content,
        n.created_at,
        n.updated_at,
        u.id AS u_id,
        u.username AS u_username,
        u.email AS u_email,
        u.full_name AS u_full_name,
        u.created_at AS u_created_at,
        u.updated_at AS u_updated_at
      FROM notes n
      LEFT JOIN users u ON n.user_id = u.id
      ORDER BY n.id ASC
    `

    const { results } = await c.env.DB.prepare(query).all<NoteRow>()

    // 格式化為相同的關聯資料結構 (過濾機密 password 欄位)
    const notes = (results || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: row.u_id
        ? {
            id: row.u_id,
            username: row.u_username,
            email: row.u_email,
            full_name: row.u_full_name,
            created_at: row.u_created_at,
            updated_at: row.u_updated_at
          }
        : null
    }))

    const duration = Date.now() - start

    // 對齊目前專案 ApiFormatMiddleware 的 JSON 回應規格
    return c.json({
      code: [0],
      data: {
        success: true,
        total: notes.length,
        data: notes
      },
      time: `${duration} ms`
    })
  } catch (error: any) {
    return c.json({
      code: [500],
      message: error.message || '內部伺服器錯誤',
      time: `${Date.now() - start} ms`
    }, 500)
  }
})

export default app
