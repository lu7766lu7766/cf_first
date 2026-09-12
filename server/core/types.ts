import type { Context } from 'hono'
import type { BaseController } from './controller'
import type { TimeService } from './time'
import type { AuthManager, UserPayload } from './auth'

export interface Env {
  DB?: D1Database
  JWT_SECRET?: string
  APP_KEY?: string
  TZ?: string
  NODE_ENV?: string
  DB_CONNECTION?: string
  DB_HOST?: string
  DB_PORT?: number | string
  DB_USER?: string
  DB_PASSWORD?: string
  DB_DATABASE?: string
  DATABASE_URL?: string
  [key: string]: any
}

export interface AdonisRequest {
  all(): Promise<Record<string, any>>
  body(): Promise<Record<string, any>>
  qs(): Record<string, string>
  input(key: string, defaultValue?: any): Promise<any>
  only(keys: string[]): Promise<Record<string, any>>
  except(keys: string[]): Promise<Record<string, any>>
  file(key: string): Promise<File | null>
  files(key?: string): Promise<File[]>
  header(name: string): string | undefined
  headers(): Record<string, string>
  param(name?: string): any
  url: string
  method: string
  raw: Request
}

export interface LazyBody {
  content?: any[]
  [key: string]: any
}

export interface AdonisResponse {
  status(code: number): AdonisResponse
  header(key: string, value: string): AdonisResponse
  json(data: any, status?: number): Response
  send(data: any): Response
  getResponse(): Response | null
  lazyBody: LazyBody
  [key: string]: any // Support dynamic Macros
}

export interface HttpContext<TUser = UserPayload> {
  request: AdonisRequest
  response: AdonisResponse
  auth: AuthManager<TUser>
  params: Record<string, string>
  env: Env
  rawContext: Context<{ Bindings: Env }>
  time: TimeService
  dateTime: TimeService
  [key: string]: any // Support dynamic Macros
}

export type NextFn = () => Promise<void>

export type MiddlewareClass = new (...args: any[]) => {
  handle(ctx: HttpContext, next: NextFn): Promise<Response | void> | Response | void
}

export type MiddlewareHandler =
  | ((ctx: HttpContext, next: NextFn, ...args: any[]) => Promise<Response | void> | Response | void)
  | MiddlewareClass
  | { handle(ctx: HttpContext, next: NextFn, ...args: any[]): Promise<Response | void> | Response | void }
  | string
  | (() => Promise<any>)

export type ControllerConstructor<T = any> = new (...args: any[]) => T

export type RouteHandlerFn = (ctx: HttpContext) => Promise<any> | any

/**
 * 取得 Controller 實例中所有可供路由呼叫的方法名稱 (排除 BaseController 的內部輔助方法如 validate)
 */
export type ControllerActionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? K extends keyof BaseController
      ? never
      : K extends string
        ? K
        : never
    : never
}[keyof T]

/**
 * 取得 Controller Class (Constructor) 所擁有的所有方法名稱
 */
export type ControllerMethods<C extends ControllerConstructor> = ControllerActionKeys<InstanceType<C>>


/**
 * 路由動作：支援 [Controller, "method"] 強型別提示與檢查，或閉包 (ctx) => any
 */
export type RouteAction<T extends ControllerConstructor = any> =
  | [T, ControllerActionKeys<InstanceType<T>>]
  | RouteHandlerFn

