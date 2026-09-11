import type { Context } from 'hono'
import type { HttpContext, AdonisRequest, AdonisResponse, Env } from './types'
import { AuthManager } from './auth'
import { MacroManager } from './macro'
import { dateTime } from './time'
import { env } from '../start/env'
import { serializeToJson } from './serializer'

export function createHttpContext(c: Context<{ Bindings: Env }>): HttpContext {
  if (c.env) {
    env.setRuntimeEnv(c.env)
  }
  let cachedBody: any = null
  let bodyParsed = false

  const request: AdonisRequest = {
    async body() {
      if (!bodyParsed) {
        try {
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
            const contentType = c.req.header('content-type') || ''
            if (contentType.includes('application/json')) {
              cachedBody = await c.req.json()
            } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
              cachedBody = await c.req.parseBody()
            }
          }
        } catch {
          cachedBody = {}
        }
        bodyParsed = true
      }
      return cachedBody || {}
    },

    qs() {
      return c.req.query()
    },

    async all() {
      const b = await this.body()
      const query = this.qs()
      return { ...query, ...b }
    },

    async input(key: string, defaultValue?: any) {
      const data = await this.all()
      return data[key] !== undefined ? data[key] : defaultValue
    },

    async only(keys: string[]) {
      const allData = await this.all()
      const result: Record<string, any> = {}
      for (const k of keys) {
        if (allData[k] !== undefined) {
          result[k] = allData[k]
        }
      }
      return result
    },

    async except(keys: string[]) {
      const allData = await this.all()
      const result: Record<string, any> = { ...allData }
      for (const k of keys) {
        delete result[k]
      }
      return result
    },

    async file(key: string) {
      try {
        const formData = await c.req.formData()
        const item: any = formData.get(key)
        return item && typeof item === 'object' && typeof item.name === 'string' ? (item as File) : null
      } catch {
        return null
      }
    },

    async files(key?: string) {
      try {
        const formData = await c.req.formData()
        const filesList: File[] = []
        if (key) {
          const items: any[] = formData.getAll(key)
          for (const item of items) {
            if (item && typeof item === 'object' && typeof item.name === 'string') {
              filesList.push(item as File)
            }
          }
          return filesList
        }
        formData.forEach((val: any) => {
          if (val && typeof val === 'object' && typeof val.name === 'string') {
            filesList.push(val as File)
          }
        })
        return filesList
      } catch {
        return []
      }
    },

    header(name: string) {
      return c.req.header(name)
    },

    headers() {
      return c.req.header()
    },

    param(name?: string) {
      if (name) {
        return c.req.param(name)
      }
      return c.req.param()
    },

    url: c.req.url,
    method: c.req.method,
    raw: c.req.raw
  }

  MacroManager.applyRequestMacros(request)

  let statusCode = 200
  let _lastResponse: Response | null = null
  const customHeaders = new Map<string, string>()

  const response: AdonisResponse = {
    status(code: number) {
      statusCode = code
      return this
    },

    header(key: string, value: string) {
      customHeaders.set(key, value)
      return this
    },

    json(data: any, status?: number) {
      const serialized = serializeToJson(data)
      this.lazyBody = { content: [serialized] }
      const finalStatus = status || statusCode
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      customHeaders.forEach((val, k) => {
        headers[k] = val
      })
      _lastResponse = new Response(JSON.stringify(serialized), {
        status: finalStatus,
        headers
      })
      return _lastResponse
    },

    send(data: any) {
      if (typeof data === 'object' && !(data instanceof Response)) {
        return this.json(data)
      }
      this.lazyBody = { content: [data] }
      const headers: Record<string, string> = {}
      customHeaders.forEach((val, k) => {
        headers[k] = val
      })
      _lastResponse = new Response(data, {
        status: statusCode,
        headers
      })
      return _lastResponse
    },

    lazyBody: { content: [] },

    getResponse() {
      return _lastResponse
    }
  }

  MacroManager.applyResponseMacros(response)

  const httpContext: HttpContext = {
    request,
    response,
    auth: null as any,
    params: c.req.param() as Record<string, string>,
    env: c.env || {},
    rawContext: c,
    time: dateTime,
    dateTime
  }

  httpContext.auth = new AuthManager(httpContext)
  MacroManager.applyContextMacros(httpContext)

  return httpContext
}
