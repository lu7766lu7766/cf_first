import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getD1NotesDemo, type Env } from './db-example'

// 宣告 Hono 實例，綁定 Cloudflare Worker 環境變數
const app = new Hono<{ Bindings: Env }>()

// 啟用 CORS 中介層（便於開發階段不同 port 或測試）
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  })
)

/**
 * 伺服器健康檢查
 */
app.get('/api/health', (c) => {
  return c.json({
    status: 'online',
    runtime: 'Cloudflare Workers (Edge)',
    serverTime: new Date().toISOString(),
    uptime: '100%'
  })
})

/**
 * 讀取 Cloudflare 邊緣節點與訪客資訊
 * 透過 c.req.raw.cf 取得 Cloudflare 全球 Anycast 節點詳細數據
 */
app.get('/api/edge-info', (c) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cf = (c.req.raw as any).cf || {}

  const rayId = c.req.header('cf-ray') || 'dev-ray-' + Math.random().toString(36).substring(2, 9)
  const clientIp =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for') ||
    '127.0.0.1 (Localhost)'

  return c.json({
    rayId,
    clientIp,
    colo: cf.colo || 'LOCAL (本地開發模擬)',
    country: cf.country || 'TW',
    city: cf.city || 'Taipei',
    timezone: cf.timezone || 'Asia/Taipei',
    asn: cf.asn || 0,
    asOrganization: cf.asOrganization || 'Localhost Network',
    httpProtocol: cf.httpProtocol || 'HTTP/2',
    tlsVersion: cf.tlsVersion || 'TLSv1.3',
    timestamp: Date.now()
  })
})

/**
 * 前後端 POST 資料傳輸測試
 */
app.post('/api/echo', async (c) => {
  try {
    const body = await c.req.json()
    const userMessage = body.message || '空訊息'
    const sender = body.sender || '匿名訪客'

    return c.json({
      success: true,
      sender,
      receivedMessage: userMessage,
      replyMessage: `[Edge 回應] 已成功於邊緣節點處理：「${userMessage}」`,
      processedAt: new Date().toISOString(),
      latencyTestId: Math.random().toString(36).substring(2, 8)
    })
  } catch {
    return c.json(
      {
        success: false,
        error: '無效的 JSON 請求格式'
      },
      400
    )
  }
})

/**
 * D1 資料庫查詢展示
 */
app.get('/api/d1-demo', async (c) => {
  const result = await getD1NotesDemo(c.env)
  return c.json(result)
})

export default app
