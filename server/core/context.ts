import type { Context } from 'hono'
import type { HttpContext, AdonisRequest, AdonisResponse, Env } from './types'
import { MacroManager } from './macro'

export function createHttpContext(c: Context<{ Bindings: Env }>): HttpContext {
  let cachedBody: any = null
  let bodyParsed = false

  const request: AdonisRequest = {
    async all() {
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
      const query = c.req.query()
      return { ...query, ...(cachedBody || {}) }
    },

    async input(key: string, defaultValue?: any) {
      const data = await this.all()
      return data[key] !== undefined ? data[key] : defaultValue
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
      const finalStatus = status || statusCode
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      customHeaders.forEach((val, k) => {
        headers[k] = val
      })
      _lastResponse = new Response(JSON.stringify(data), {
        status: finalStatus,
        headers
      })
      return _lastResponse
    },

    send(data: any) {
      if (typeof data === 'object' && !(data instanceof Response)) {
        return this.json(data)
      }
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

    getResponse() {
      return _lastResponse
    }
  }

  MacroManager.applyResponseMacros(response)

  const httpContext: HttpContext = {
    request,
    response,
    auth: null, // Initialized by AuthManager or middleware
    params: c.req.param() as Record<string, string>,
    env: c.env || {},
    rawContext: c
  }

  MacroManager.applyContextMacros(httpContext)

  return httpContext
}
