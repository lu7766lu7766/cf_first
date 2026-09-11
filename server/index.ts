import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { router } from './core/router'
import { bootstrapKernel } from './start/kernel'
import { corsConfig } from './config/cors'
import type { Env } from './core/types'

// 1. 初始化 AdonisJS 7 內核 (註冊全域/具名 Middleware、Macro 與 Exception Handler)
bootstrapKernel()

// 2. 載入路由定義
import './start/routes'

// 2. 宣告 Hono 實例
const app = new Hono<{ Bindings: Env }>()

// 3. 套用 config/cors.ts 設定
app.use(
  '*',
  cors({
    origin: corsConfig.origin as any,
    allowMethods: corsConfig.methods,
    allowHeaders: corsConfig.headers,
    credentials: corsConfig.credentials
  })
)

// 4. 將 AdonisJS 路由無縫掛載至 Hono App
router.mountToHono(app)

export default app
