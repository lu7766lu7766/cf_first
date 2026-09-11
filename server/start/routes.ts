import { router } from "../core/router"
import { HttpException } from "../core/exception_handler"
import AuthController from "../app/controllers/auth_controller"
import NotesController from "../app/controllers/notes_controller"
import UsersController from "../app/controllers/users_controller"
import { middleware } from "./kernel"
import { dateTime, DateTime } from "../core/time"
import { appConfig } from "../config/app"
import { databaseConfig } from "../config/database"
import { User } from "../app/models/user"
import { Note } from "../app/models/note"

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

    // 4.1 使用者列表路由 (/api/users，需要 JWT Auth)
    router.get("/users", [UsersController, "index"]).use([middleware.auth("jwt")])

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

    // 11. Model 關聯與 Luxon DateTime 測試路由 (/api/relation-test)
    router.get("/relation-test", async () => {
      // 1. 查找 root 使用者
      const user = await User.findBy("username", "root")
      if (!user) {
        throw new HttpException("找不到 root 使用者，請先執行 seeder", 404)
      }

      // 2. 確保至少有一筆 note 指向 user
      let note = await Note.findBy("user_id", user.id)
      if (!note) {
        note = await Note.create({
          user_id: user.id,
          title: "Root 的第一篇關聯筆記",
          content: "這是一篇透過 hasMany / belongsTo 關聯建立的筆記"
        })
      }

      // 3. 測試 user.load('notes') (hasMany)
      await user.load("notes")

      // 4. 測試 note.load('user') (belongsTo)
      await note.load("user")

      return {
        message: "Model 關聯與 DateTime (Luxon) 運作正常",
        dateTimeCheck: {
          isCreatedAtDateTime: DateTime.isDateTime(user.createdAt),
          userCreatedAtIso: user.createdAt?.toISO(),
          noteCreatedAtIso: note.createdAt?.toISO(),
          year: user.createdAt?.year,
          month: user.createdAt?.month,
          day: user.createdAt?.day,
        },
        relationships: {
          userWithNotes: user.toJSON(),
          noteWithUser: note.toJSON()
        }
      }
    })
  })
  .prefix("/api")
  .use([middleware.apiFormat()])
