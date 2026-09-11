import { router } from "../core/router"
import { HttpException } from "../core/exception_handler"
import AuthController from "../app/controllers/auth_controller"
import NotesController from "../app/controllers/notes_controller"
import { middleware } from "./kernel"
import { dateTime } from "../core/time"
import { appConfig } from "../config/app"
import { databaseConfig } from "../config/database"

// 所有 API 路由統一使用 router.group() 管理，全域中介層 (ApiFormatMiddleware) 已在 start/kernel.ts 註冊
router
  .group(() => {
    // 1. 健康檢查路由 (/api/health)
    router.get("/health", (ctx) => {
      const now = ctx.time.now()
      return {
        status: "online",
        framework: "Hono + AdonisJS 7 API architecture",
        runtime: "Cloudflare Workers (Edge)",
        serverTime: now.toISO(),
        timezone: ctx.time.getTimezone(),
        formattedTime: ctx.time.format(now, "yyyy-MM-dd HH:mm:ss ZZ"),
      }
    })

    // 2. 身分驗證巢狀群組 (/api/auth/*)
    router
      .group(() => {
        router.post("/register", [AuthController, "register"])
        router.post("/login", [AuthController, "login"])
        // 支援具名中介層 middleware.auth('jwt') 或字串 'auth:jwt'
        router.get("/me", [AuthController, "me"]).use([middleware.auth("jwt")])
      })
      .prefix("/auth")

    // 3. 資料庫 Transaction 測試路由 (/api/notes/transaction-test)
    router.post("/notes/transaction-test", [NotesController, "transactionTest"])

    // 4. Notes 資源路由 (/api/notes)
    router.resource("notes", NotesController)

    // 5. Response Macro 測試路由 (/api/macro-test)
    router.get("/macro-test", (ctx) => {
      return ctx.response.apiSuccess({ feature: "Response Macro" }, "恭喜！成功呼叫自訂 Response Macro 巨集")
    })

    // 6. 全域 Exception Handler 攔截測試路由 (/api/error-test)
    router.get("/error-test", () => {
      throw new HttpException("這是由 AppExceptionHandler 全域捕捉並格式化的自訂異常", 400, "E_SAMPLE_ERROR")
    })

    // 7. Body Parser 測試路由 (/api/body-parser-test)
    router.post("/body-parser-test", async (ctx) => {
      const body = await ctx.request.body()
      const qs = ctx.request.qs()
      const only = await ctx.request.only(["name"])
      const except = await ctx.request.except(["password"])
      return { body, qs, only, except }
    })

    // 8. 格式整合測試路由 (/api/format-test)
    router.get("/format-test", () => {
      return { message: "直接返回物件，由中介層格式化" }
    })

    // 9. 環境變數設定檢驗路由 (/api/env-info)
    router.get("/env-info", () => {
      const rawKey = appConfig.appKey || ""
      const maskedKey = rawKey.length > 8
        ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}`
        : "********"

      return {
        app: {
          timezone: appConfig.timezone,
          nodeEnv: appConfig.nodeEnv,
          port: appConfig.port,
          appKeyConfigured: !!rawKey,
          appKeyMasked: maskedKey
        },
        database: {
          defaultConnection: databaseConfig.default,
          d1Binding: databaseConfig.connections.d1.binding,
          mysql: {
            host: databaseConfig.connections.mysql.host,
            port: databaseConfig.connections.mysql.port,
            user: databaseConfig.connections.mysql.user,
            database: databaseConfig.connections.mysql.database
          },
          postgres: {
            host: databaseConfig.connections.postgres.host,
            port: databaseConfig.connections.postgres.port,
            user: databaseConfig.connections.postgres.user,
            database: databaseConfig.connections.postgres.database
          }
        }
      }
    })

    // 10. Luxon 時間物件運算展示路由 (/api/time-test)
    router.get("/time-test", (ctx) => {
      const now = ctx.time.now()
      const oneWeekLater = now.plus({ weeks: 1 })
      const utcTime = now.toUTC()
      const tokyoTime = now.setZone("Asia/Tokyo")
      const newYorkTime = now.setZone("America/New_York")

      return {
        now: {
          iso: now.toISO(),
          timezone: now.zoneName,
          formatted: ctx.time.format(now, "yyyy-MM-dd HH:mm:ss.SSS ZZ"),
          dayOfWeek: now.weekdayLong
        },
        calculations: {
          plusOneWeek: ctx.time.format(oneWeekLater, "yyyy-MM-dd HH:mm:ss"),
          inUtc: utcTime.toISO(),
          inTokyo: ctx.time.format(tokyoTime, "yyyy-MM-dd HH:mm:ss ZZ"),
          inNewYork: ctx.time.format(newYorkTime, "yyyy-MM-dd HH:mm:ss ZZ"),
          daysInMonth: now.daysInMonth
        }
      }
    })
  })
  .prefix("/api")
  .use([middleware.apiFormat()])
