import { router } from "../core/router"
import { HttpException } from "../core/exception_handler"
import AuthController from "../app/controllers/auth_controller"
import NotesController from "../app/controllers/notes_controller"
import { middleware } from "./kernel"

// 所有 API 路由統一使用 router.group() 管理，全域中介層 (ApiFormatMiddleware) 已在 start/kernel.ts 註冊
router
  .group(() => {
    // 1. 健康檢查路由 (/api/health)
    router.get("/health", () => {
      return {
        status: "online",
        framework: "Hono + AdonisJS 7 API architecture",
        runtime: "Cloudflare Workers (Edge)",
        serverTime: new Date().toISOString(),
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
  })
  .prefix("/api")
  .use([middleware.apiFormat()])
