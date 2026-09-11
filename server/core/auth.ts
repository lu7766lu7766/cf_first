import { AuthenticationException } from './exception_handler'
import type { HttpContext, MiddlewareHandler } from './types'

export interface UserPayload {
  id: number | string
  email: string
  [key: string]: any
}

// 簡易 Web Crypto JWT 實作，零外部依賴且完全相容 Cloudflare Workers
class WebCryptoJwt {
  private static async getKey(secret: string) {
    const enc = new TextEncoder()
    return await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )
  }

  private static base64UrlEncode(str: string): string {
    const bytes = new TextEncoder().encode(str)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  private static bytesToBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  private static base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  }

  private static base64UrlToBytes(str: string): Uint8Array {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  static async sign(payload: any, secret: string, expiresInSeconds = 86400): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' }
    const now = Math.floor(Date.now() / 1000)
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds }

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header))
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload))
    const dataToSign = `${encodedHeader}.${encodedPayload}`

    const key = await this.getKey(secret)
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataToSign))
    const encodedSignature = this.bytesToBase64Url(new Uint8Array(signature))

    return `${dataToSign}.${encodedSignature}`
  }

  static async verify(token: string, secret: string): Promise<any> {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid token structure')
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const dataToSign = `${encodedHeader}.${encodedPayload}`

    const key = await this.getKey(secret)
    const signature = this.base64UrlToBytes(encodedSignature)

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature as any,
      new TextEncoder().encode(dataToSign)
    )

    if (!isValid) {
      throw new Error('Invalid token signature')
    }

    const payload = JSON.parse(this.base64UrlDecode(encodedPayload))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      throw new Error('Token has expired')
    }

    return payload
  }
}

// 記憶體 / 模擬 Token 儲存池
const memoryTokenStore = new Map<string, UserPayload>()

export class AuthGuard {
  constructor(protected ctx: HttpContext, protected secret: string) {}

  async authenticate(): Promise<UserPayload> {
    throw new Error('Method not implemented')
  }

  async generate(user: UserPayload): Promise<string> {
    throw new Error('Method not implemented')
  }
}

export class JwtGuard extends AuthGuard {
  async authenticate(): Promise<UserPayload> {
    const authHeader = this.ctx.request.header('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('Missing or invalid Authorization header')
    }

    const token = authHeader.substring(7)
    try {
      const payload = await WebCryptoJwt.verify(token, this.secret)
      return payload
    } catch {
      throw new AuthenticationException('Invalid or expired authentication token')
    }
  }

  async generate(user: UserPayload, expiresInSeconds = 86400): Promise<string> {
    return await WebCryptoJwt.sign(user, this.secret, expiresInSeconds)
  }
}

export class TokensGuard extends AuthGuard {
  async authenticate(): Promise<UserPayload> {
    const authHeader = this.ctx.request.header('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('Missing or invalid Authorization header')
    }

    const token = authHeader.substring(7)
    const user = memoryTokenStore.get(token)
    if (!user) {
      throw new AuthenticationException('Opaque access token not found or revoked')
    }
    return user
  }

  async generate(user: UserPayload): Promise<string> {
    const randomBytes = new Uint8Array(24)
    crypto.getRandomValues(randomBytes)
    const token = 'oat_' + Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('')
    memoryTokenStore.set(token, user)
    return token
  }
}

export class AuthManager {
  private currentGuard = 'jwt'
  public user: UserPayload | null = null

  constructor(private ctx: HttpContext) {}

  use(guardName: 'jwt' | 'tokens'): AuthGuard {
    const secret = this.ctx.env.JWT_SECRET || 'cf-first-super-secret-adonis-jwt-key'
    if (guardName === 'tokens') {
      return new TokensGuard(this.ctx, secret)
    }
    return new JwtGuard(this.ctx, secret)
  }

  async authenticate(guardName?: 'jwt' | 'tokens'): Promise<UserPayload> {
    const guard = this.use(guardName || (this.currentGuard as any))
    const user = await guard.authenticate()
    this.user = user
    return user
  }

  async check(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    } catch {
      return false
    }
  }

  async login(user: UserPayload, guardName: 'jwt' | 'tokens' = 'jwt'): Promise<string> {
    const guard = this.use(guardName)
    this.user = user
    return await guard.generate(user)
  }
}

/**
 * Adonis 風格的 authMiddleware
 */
export function authMiddleware(guardName: 'jwt' | 'tokens' = 'jwt'): MiddlewareHandler {
  return async (ctx, next) => {
    await ctx.auth.authenticate(guardName)
    await next()
  }
}
