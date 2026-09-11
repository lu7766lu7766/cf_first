import type { Context } from 'hono'

export interface Env {
  DB?: D1Database
  JWT_SECRET?: string
  APP_KEY?: string
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

export interface HttpContext {
  request: AdonisRequest
  response: AdonisResponse
  auth: any
  params: Record<string, string>
  env: Env
  rawContext: Context<{ Bindings: Env }>
  [key: string]: any // Support dynamic Macros
}

export type NextFn = () => Promise<void>

export type MiddlewareClass = new (...args: any[]) => {
  handle(ctx: HttpContext, next: NextFn): Promise<Response | void> | Response | void
}

export type MiddlewareHandler =
  | ((ctx: HttpContext, next: NextFn) => Promise<Response | void> | Response | void)
  | MiddlewareClass
  | { handle(ctx: HttpContext, next: NextFn): Promise<Response | void> | Response | void }

export type ControllerConstructor<T = any> = new (...args: any[]) => T

export type RouteAction = [ControllerConstructor, string] | ((ctx: HttpContext) => Promise<any> | any)
