import type { HttpContext, NextFn, MiddlewareHandler, MiddlewareClass } from './types'
import { Container } from './container'

export type NamedMiddlewareDef =
  | MiddlewareHandler
  | (() => Promise<any>)
  | ((...args: any[]) => any)

export class HttpKernel {
  private static globalMiddlewareList: MiddlewareHandler[] = []
  private static namedMiddlewareMap: Map<string, NamedMiddlewareDef> = new Map()
  private static resolvedCache: Map<string, any> = new Map()

  /**
   * 註冊全域中介層 (Global Middleware Stack)
   * 每個 HTTP 請求皆會依序執行這些中介層
   */
  static global(middlewares: MiddlewareHandler | MiddlewareHandler[]): typeof HttpKernel {
    const arr = Array.isArray(middlewares) ? middlewares : [middlewares]
    this.globalMiddlewareList.push(...arr)
    return this
  }

  /**
   * 伺服器級全域中介層 (AdonisJS server.use 相容別名)
   */
  static use(middlewares: MiddlewareHandler | MiddlewareHandler[]): typeof HttpKernel {
    return this.global(middlewares)
  }

  /**
   * 取得所有已註冊的全域中介層
   */
  static getGlobalMiddlewares(): MiddlewareHandler[] {
    return [...this.globalMiddlewareList]
  }

  /**
   * 註冊具名中介層 (Named Middleware Collection)
   * 回傳可調用的 Proxy 物件，例如 `middleware.auth('jwt')` 或 `middleware.apiFormat()`
   */
  static named<T extends Record<string, NamedMiddlewareDef>>(
    map: T
  ): { [K in keyof T]: (...args: any[]) => MiddlewareHandler } & Record<string, (...args: any[]) => MiddlewareHandler> {
    for (const [name, def] of Object.entries(map)) {
      this.namedMiddlewareMap.set(name, def)
    }

    const proxy = new Proxy({} as any, {
      get: (_target, prop: string) => {
        return (...args: any[]) => {
          // 回傳延遲執行之中介層包裝函數
          const namedMiddlewareWrapper = async (ctx: HttpContext, next: NextFn) => {
            const resolved = await HttpKernel.resolveNamed(prop, args)
            return await HttpKernel.execute(resolved, ctx, next)
          }
          Object.defineProperty(namedMiddlewareWrapper, 'name', { value: `named_${prop}` })
          return namedMiddlewareWrapper
        }
      }
    })

    return proxy
  }

  /**
   * 根據名稱與參數解析具名中介層
   */
  static async resolveNamed(nameOrString: string, args: any[] = []): Promise<any> {
    let name = nameOrString
    let passedArgs = args

    // 支援 'auth:jwt' 語法格式
    if (nameOrString.includes(':') && args.length === 0) {
      const parts = nameOrString.split(':')
      name = parts[0]
      passedArgs = parts.slice(1)
    }

    const def = this.namedMiddlewareMap.get(name)
    if (!def) {
      throw new Error(`未註冊的具名中介層: "${name}"。請先在 start/kernel.ts 中註冊。`)
    }

    let target: any = def

    // 若為 Lazy Import: () => import(...)
    if (typeof target === 'function' && !target.prototype?.handle && target.length === 0) {
      const cacheKey = `${name}`
      if (!this.resolvedCache.has(cacheKey)) {
        const imported = await target()
        const resolved = imported[name] || imported.default || imported
        this.resolvedCache.set(cacheKey, resolved)
      }
      target = this.resolvedCache.get(cacheKey)
    }

    // 若為工廠函數 (例如 auth = (guard) => authMiddleware(guard))
    if (typeof target === 'function' && !target.prototype?.handle) {
      return target(...passedArgs)
    }

    return target
  }

  /**
   * 執行單一中介層 (支援 Class、函數、物件、字串或 Lazy Import)
   */
  static async execute(rawMiddleware: any, ctx: HttpContext, next: NextFn): Promise<any> {
    let target = rawMiddleware

    // 1. 若傳入的是字串 (例如 route.use('auth') 或 route.use('auth:jwt'))
    if (typeof target === 'string') {
      target = await this.resolveNamed(target)
    }

    // 2. 若為 Lazy Import 函數
    if (typeof target === 'function' && !target.prototype?.handle && target.length === 0) {
      const imported = await target()
      target = imported.default || imported
    }

    // 3. 若為 Class 建構式 (具有 handle 方法)
    if (typeof target === 'function' && target.prototype && typeof target.prototype.handle === 'function') {
      const instance: any = Container.make(target as MiddlewareClass)
      return await instance.handle(ctx, next)
    }

    // 4. 若為包含 handle 方法的物件實例
    if (target && typeof target.handle === 'function') {
      return await target.handle(ctx, next)
    }

    // 5. 若為標準中介層函數 (ctx, next)
    if (typeof target === 'function') {
      return await target(ctx, next)
    }

    throw new Error(`無法執行的中介層格式: ${typeof target}`)
  }

  /**
   * 清除註冊之中介層 (供測試重置使用)
   */
  static clear(): void {
    this.globalMiddlewareList = []
    this.namedMiddlewareMap.clear()
    this.resolvedCache.clear()
  }
}

export const kernel = HttpKernel
export const server = {
  use: (middlewares: MiddlewareHandler | MiddlewareHandler[]) => HttpKernel.global(middlewares)
}
