import { Hono } from 'hono'
import type { HttpContext, RouteAction, MiddlewareHandler, Env, ControllerConstructor } from './types'
import { createHttpContext } from './context'
import { Container } from './container'
import { AuthManager } from './auth'
import { Database } from './database'
import { HttpExceptionHandler } from './exception_handler'

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

export class RouteGroup {
  public routes: Route[] = []
  private groupPrefix = ''
  private groupMiddlewares: MiddlewareHandler[] = []

  constructor(private callback: () => void) {}

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

  applyGroup(): void {
    // 執行群組回呼以收集子路由
    AdonisRouter.setCurrentGroup(this)
    this.callback()
    AdonisRouter.setCurrentGroup(null)

    // 套用群組 prefix 與 middlewares
    for (const route of this.routes) {
      if (this.groupPrefix) {
        route.path = this.groupPrefix + (route.path.startsWith('/') ? route.path : `/${route.path}`)
      }
      route.middlewares.unshift(...this.groupMiddlewares)
    }
  }
}

export class AdonisRouter {
  private static registeredRoutes: Route[] = []
  private static currentGroup: RouteGroup | null = null
  private static exceptionHandler: HttpExceptionHandler = new HttpExceptionHandler()

  static setExceptionHandler(handler: HttpExceptionHandler) {
    this.exceptionHandler = handler
  }

  static setCurrentGroup(group: RouteGroup | null) {
    this.currentGroup = group
  }

  private static addRoute(method: string, path: string, action: RouteAction): Route {
    const route = new Route(method.toUpperCase(), path, action)
    if (this.currentGroup) {
      this.currentGroup.routes.push(route)
    } else {
      this.registeredRoutes.push(route)
    }
    return route
  }

  static get(path: string, action: RouteAction): Route {
    return this.addRoute('GET', path, action)
  }

  static post(path: string, action: RouteAction): Route {
    return this.addRoute('POST', path, action)
  }

  static put(path: string, action: RouteAction): Route {
    return this.addRoute('PUT', path, action)
  }

  static patch(path: string, action: RouteAction): Route {
    return this.addRoute('PATCH', path, action)
  }

  static delete(path: string, action: RouteAction): Route {
    return this.addRoute('DELETE', path, action)
  }

  /**
   * AdonisJS 經典 resource 路由自動註冊
   */
  static resource(name: string, controller: ControllerConstructor): void {
    const cleanName = name.replace(/^\//, '')
    this.get(`/${cleanName}`, [controller, 'index'])
    this.post(`/${cleanName}`, [controller, 'store'])
    this.get(`/${cleanName}/:id`, [controller, 'show'])
    this.put(`/${cleanName}/:id`, [controller, 'update'])
    this.delete(`/${cleanName}/:id`, [controller, 'destroy'])
  }

  /**
   * 路由群組
   */
  static group(callback: () => void): RouteGroup {
    const group = new RouteGroup(callback)
    group.applyGroup()
    for (const r of group.routes) {
      this.registeredRoutes.push(r)
    }
    return group
  }

  /**
   * 將所有已定義的 Adonis 路由註冊至 Hono App
   */
  static mountToHono(honoApp: Hono<{ Bindings: Env }>): void {
    for (const route of this.registeredRoutes) {
      const honoMethod = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'

      if (typeof honoApp[honoMethod] === 'function') {
        honoApp[honoMethod](route.path, async (c) => {
          const ctx = createHttpContext(c)
          ctx.auth = new AuthManager(ctx)
          Database.setEnv(c.env)

          try {
            let actionResponse: Response | null = null

            // 執行中介層管線 (Middleware Pipeline)
            let middlewareIndex = 0
            const next = async (): Promise<void> => {
              if (middlewareIndex < route.middlewares.length) {
                const currentMiddleware = route.middlewares[middlewareIndex++]
                await currentMiddleware(ctx, next)
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
