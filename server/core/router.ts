import { Hono } from 'hono'
import type { HttpContext, RouteAction, RouteHandlerFn, ControllerMethods, MiddlewareHandler, Env, ControllerConstructor } from './types'
import { createHttpContext } from './context'
import { Container } from './container'
import { AuthManager } from './auth'
import { Database } from './database'
import { HttpExceptionHandler } from './exception_handler'
import { HttpKernel } from './kernel'
import { serializeToJson } from './serializer'

export class Route {
  public middlewares: MiddlewareHandler[] = []

  constructor(
    public method: string,
    public path: string,
    public action: RouteAction
  ) {}

  use(middlewares: MiddlewareHandler | MiddlewareHandler[]): this {
    if (Array.isArray(middlewares)) {
      this.middlewares.push(...middlewares)
    } else {
      this.middlewares.push(middlewares)
    }
    return this
  }
}

function combinePaths(prefix: string, path: string): string {
  const p = prefix ? prefix.trim() : ''
  const sub = path ? path.trim() : ''
  if (!p) {
    return sub.startsWith('/') ? sub : `/${sub}`
  }
  const cleanPrefix = p.startsWith('/') ? p.replace(/\/+$/, '') : `/${p.replace(/\/+$/, '')}`
  if (!sub || sub === '/') {
    return cleanPrefix
  }
  const cleanSub = sub.startsWith('/') ? sub : `/${sub}`
  return `${cleanPrefix}${cleanSub}`
}

export class RouteGroup {
  public children: (Route | RouteGroup)[] = []
  private groupPrefix = ''
  private groupMiddlewares: MiddlewareHandler[] = []

  constructor(callback?: (group: RouteGroup) => void) {
    if (callback) {
      AdonisRouter.pushGroup(this)
      callback(this)
      AdonisRouter.popGroup()
    }
  }

  add(child: Route | RouteGroup): this {
    this.children.push(child)
    return this
  }

  prefix(p: string): this {
    this.groupPrefix = p
    return this
  }

  use(middlewares: MiddlewareHandler | MiddlewareHandler[]): this {
    if (Array.isArray(middlewares)) {
      this.groupMiddlewares.push(...middlewares)
    } else {
      this.groupMiddlewares.push(middlewares)
    }
    return this
  }

  get<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  get(path: string, action: RouteHandlerFn): Route
  get(path: string, action: any): Route {
    const route = new Route('GET', path, action)
    this.add(route)
    return route
  }

  post<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  post(path: string, action: RouteHandlerFn): Route
  post(path: string, action: any): Route {
    const route = new Route('POST', path, action)
    this.add(route)
    return route
  }

  put<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  put(path: string, action: RouteHandlerFn): Route
  put(path: string, action: any): Route {
    const route = new Route('PUT', path, action)
    this.add(route)
    return route
  }

  patch<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  patch(path: string, action: RouteHandlerFn): Route
  patch(path: string, action: any): Route {
    const route = new Route('PATCH', path, action)
    this.add(route)
    return route
  }

  delete<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  delete(path: string, action: RouteHandlerFn): Route
  delete(path: string, action: any): Route {
    const route = new Route('DELETE', path, action)
    this.add(route)
    return route
  }

  resource(name: string, controller: ControllerConstructor): void {
    const cleanName = name.replace(/^\//, '')
    this.get(`/${cleanName}`, [controller, 'index'] as any)
    this.post(`/${cleanName}`, [controller, 'store'] as any)
    this.get(`/${cleanName}/:id`, [controller, 'show'] as any)
    this.put(`/${cleanName}/:id`, [controller, 'update'] as any)
    this.delete(`/${cleanName}/:id`, [controller, 'destroy'] as any)
  }

  /**
   * 遞迴解析並展開此群組內所有子路由，套用 prefix 與中介層
   */
  getRoutes(parentPrefix = '', parentMiddlewares: MiddlewareHandler[] = []): Route[] {
    const cleanGroupPrefix = this.groupPrefix
      ? (this.groupPrefix.startsWith('/') ? this.groupPrefix : `/${this.groupPrefix}`).replace(/\/+$/, '')
      : ''
    const currentPrefix = parentPrefix + cleanGroupPrefix
    const currentMiddlewares = [...parentMiddlewares, ...this.groupMiddlewares]

    const flatRoutes: Route[] = []
    for (const child of this.children) {
      if (child instanceof Route) {
        const fullPath = combinePaths(currentPrefix, child.path)
        const resolvedRoute = new Route(child.method, fullPath, child.action)
        resolvedRoute.middlewares = [...currentMiddlewares, ...child.middlewares]
        flatRoutes.push(resolvedRoute)
      } else if (child instanceof RouteGroup) {
        flatRoutes.push(...child.getRoutes(currentPrefix, currentMiddlewares))
      }
    }
    return flatRoutes
  }
}

export class AdonisRouter {
  private static registeredNodes: (Route | RouteGroup)[] = []
  private static groupStack: RouteGroup[] = []
  private static exceptionHandler: HttpExceptionHandler = new HttpExceptionHandler()
  private static globalMiddlewares: MiddlewareHandler[] = []

  static setExceptionHandler(handler: HttpExceptionHandler) {
    this.exceptionHandler = handler
  }

  static pushGroup(group: RouteGroup) {
    this.groupStack.push(group)
  }

  static popGroup() {
    this.groupStack.pop()
  }

  private static addRoute(method: string, path: string, action: RouteAction): Route {
    const route = new Route(method.toUpperCase(), path, action)
    if (this.groupStack.length > 0) {
      this.groupStack[this.groupStack.length - 1].add(route)
    } else {
      this.registeredNodes.push(route)
    }
    return route
  }

  static get<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  static get(path: string, action: RouteHandlerFn): Route
  static get(path: string, action: any): Route {
    return this.addRoute('GET', path, action)
  }

  static post<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  static post(path: string, action: RouteHandlerFn): Route
  static post(path: string, action: any): Route {
    return this.addRoute('POST', path, action)
  }

  static put<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  static put(path: string, action: RouteHandlerFn): Route
  static put(path: string, action: any): Route {
    return this.addRoute('PUT', path, action)
  }

  static patch<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  static patch(path: string, action: RouteHandlerFn): Route
  static patch(path: string, action: any): Route {
    return this.addRoute('PATCH', path, action)
  }

  static delete<T extends ControllerConstructor>(path: string, action: [T, NoInfer<ControllerMethods<T>>]): Route
  static delete(path: string, action: RouteHandlerFn): Route
  static delete(path: string, action: any): Route {
    return this.addRoute('DELETE', path, action)
  }


  /**
   * AdonisJS 經典 resource 路由自動註冊
   */
  static resource(name: string, controller: ControllerConstructor): void {
    const cleanName = name.replace(/^\//, '')
    this.get(`/${cleanName}`, [controller, 'index'] as any)
    this.post(`/${cleanName}`, [controller, 'store'] as any)
    this.get(`/${cleanName}/:id`, [controller, 'show'] as any)
    this.put(`/${cleanName}/:id`, [controller, 'update'] as any)
    this.delete(`/${cleanName}/:id`, [controller, 'destroy'] as any)
  }

  /**
   * 路由群組 (Route Group)
   * 支援 .prefix('/api') 與 .use([middleware]) 鏈式呼叫，以及巢狀群組
   */
  static group(callback: (group: RouteGroup) => void): RouteGroup {
    const group = new RouteGroup()
    if (this.groupStack.length > 0) {
      this.groupStack[this.groupStack.length - 1].add(group)
    } else {
      this.registeredNodes.push(group)
    }
    this.pushGroup(group)
    callback(group)
    this.popGroup()
    return group
  }

  /**
   * 取得所有已展開之平坦化路由
   */
  static getRoutes(): Route[] {
    const flatRoutes: Route[] = []
    for (const node of this.registeredNodes) {
      if (node instanceof Route) {
        flatRoutes.push(node)
      } else if (node instanceof RouteGroup) {
        flatRoutes.push(...node.getRoutes())
      }
    }
    return flatRoutes
  }

  /**
   * 註冊全域中介層 (AdonisJS router.use)
   */
  static use(middlewares: MiddlewareHandler | MiddlewareHandler[]): void {
    if (Array.isArray(middlewares)) {
      this.globalMiddlewares.push(...middlewares)
    } else {
      this.globalMiddlewares.push(middlewares)
    }
  }

  /**
   * 註冊具名中介層集合 (AdonisJS router.named 相容)
   */
  static named(map: Record<string, any>) {
    return HttpKernel.named(map)
  }

  /**
   * 清除所有已註冊之路由 (供測試使用)
   */
  static clear(): void {
    this.registeredNodes = []
    this.groupStack = []
    this.globalMiddlewares = []
  }

  /**
   * 將所有已定義的 Adonis 路由註冊至 Hono App
   */
  static mountToHono(honoApp: Hono<{ Bindings: Env }>): void {
    const allRoutes = this.getRoutes()
    for (const route of allRoutes) {
      const honoMethod = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'

      if (typeof honoApp[honoMethod] === 'function') {
        honoApp[honoMethod](route.path, async (c) => {
          const ctx = createHttpContext(c)
          ctx.auth = new AuthManager(ctx)
          Database.setEnv(c.env)

          try {
            let actionResponse: Response | null = null
            const allMiddlewares = [
              ...AdonisRouter.globalMiddlewares,
              ...HttpKernel.getGlobalMiddlewares(),
              ...route.middlewares
            ]

            // 執行中介層管線 (Middleware Pipeline)
            let middlewareIndex = 0
            const next = async (): Promise<void> => {
              if (middlewareIndex < allMiddlewares.length) {
                const rawMiddleware = allMiddlewares[middlewareIndex++]
                const res = await HttpKernel.execute(rawMiddleware, ctx, next)
                if (res instanceof Response) {
                  actionResponse = res
                }
              } else {
                // 執行 Controller Action
                let result: any
                if (Array.isArray(route.action)) {
                  const [ControllerClass, actionName] = route.action
                  const instance = Container.make(ControllerClass)
                  if (typeof (instance as any)[actionName] !== 'function') {
                    throw new Error(`Controller 方法未定義: ${ControllerClass.name}.${actionName}`)
                  }
                  result = await (instance as any)[actionName](ctx)
                } else if (typeof route.action === 'function') {
                  result = await route.action(ctx)
                }

                if (result !== undefined && !(result instanceof Response)) {
                  result = serializeToJson(result)
                  ctx.response.lazyBody = { content: [result] }
                }

                if (result instanceof Response) {
                  actionResponse = result
                } else if (result !== undefined) {
                  actionResponse = ctx.response.json(result)
                }
              }
            }

            await next()
            return actionResponse || ctx.response.getResponse() || new Response(null, { status: 204 })
          } catch (error) {
            await this.exceptionHandler.report(error, ctx)
            return await this.exceptionHandler.handle(error, ctx)
          }
        })
      }
    }
  }
}

export const router = AdonisRouter
