import type { Context } from 'hono'

export interface Env {
  DB?: D1Database
  JWT_SECRET?: string
  APP_KEY?: string
  [key: string]: any
}

export interface AdonisRequest {
  all(): Promise<Record<string, any>>
  input(key: string, defaultValue?: any): Promise<any>
  header(name: string): string | undefined
  headers(): Record<string, string>
  param(name?: string): any
  url: string
  method: string
  raw: Request
}

export interface AdonisResponse {
  status(code: number): AdonisResponse
  header(key: string, value: string): AdonisResponse
  json(data: any, status?: number): Response
  send(data: any): Response
  getResponse(): Response | null
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

export type MiddlewareHandler = (ctx: HttpContext, next: NextFn) => Promise<Response | void> | Response | void

export type ControllerConstructor<T = any> = new (...args: any[]) => T

export type RouteAction = [ControllerConstructor, string] | ((ctx: HttpContext) => Promise<any> | any)
