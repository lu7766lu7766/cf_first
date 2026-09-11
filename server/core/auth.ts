import { AuthenticationException } from './exception_handler'
import type { HttpContext, MiddlewareHandler } from './types'
import { appConfig } from '../config/app'
import { authConfig } from '../config/auth'
import { serializeToJson } from './serializer'
import { Database } from './database'
import { dateTime } from './time'

export interface UserPayload {
  id: number | string
  email: string
  [key: string]: any
}

export type Authenticatable = UserPayload | { toJSON(): any } | any

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

  static async sign(payload: any, secret: string, expiresInSeconds: number | null = 86400): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' }
    const now = Math.floor(Date.now() / 1000)
    const fullPayload: Record<string, any> = {
      ...payload,
      jti: payload.jti || crypto.randomUUID(),
      iat: now
    }

    if (expiresInSeconds && expiresInSeconds > 0) {
      fullPayload.exp = now + expiresInSeconds
    }

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

export abstract class AuthGuard {
  constructor(protected ctx: HttpContext<any>, protected secret: string) {}

  abstract authenticate(): Promise<UserPayload>
  abstract generate(user: Authenticatable, ...args: any[]): Promise<string>
  abstract revoke(all?: boolean): Promise<void>
}

export class JwtGuard extends AuthGuard {
  async authenticate(): Promise<UserPayload> {
    const authHeader = this.ctx.request.header('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('Missing or invalid Authorization header', 'E_UNAUTHORIZED')
    }

    const token = authHeader.substring(7)
    try {
      const payload = await WebCryptoJwt.verify(token, this.secret)
      return payload
    } catch {
      throw new AuthenticationException('Invalid or expired authentication token', 'E_UNAUTHORIZED')
    }
  }

  async generate(user: Authenticatable, expiresInSeconds: number | null = authConfig.guards.jwt.expiresIn): Promise<string> {
    const payload = serializeToJson(user)
    return await WebCryptoJwt.sign(payload, this.secret, expiresInSeconds)
  }

  async revoke(_all = false): Promise<void> {
    // 純無狀態 JWT 本身不維護資料表狀態
  }
}

export class TokensGuard extends AuthGuard {
  public currentAccessToken: any = null
  public rawToken: string | null = null

  private static async hashToken(token: string): Promise<string> {
    const enc = new TextEncoder()
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(token))
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }

  private isSsoEnabled(): boolean {
    return authConfig.ssoEnabled
  }

  async authenticate(): Promise<UserPayload> {
    const authHeader = this.ctx.request.header('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('缺少或無效的授權標頭 (Missing or invalid Authorization header)', 'E_UNAUTHORIZED')
    }

    const token = authHeader.substring(7).trim()
    if (!token) {
      throw new AuthenticationException('未提供存取權杖 (Missing access token)', 'E_UNAUTHORIZED')
    }

    const hash = await TokensGuard.hashToken(token)

    if (this.ctx.env) {
      Database.setEnv(this.ctx.env)
    }

    const tokenRecord = await Database.from('auth_access_tokens').where('hash', hash).first()
    if (!tokenRecord) {
      throw new AuthenticationException('存取權杖不存在或已被註銷 (Token revoked or not found)', 'E_UNAUTHORIZED')
    }

    // 檢查有效期限
    if (tokenRecord.expires_at) {
      const exp = dateTime.fromISO(tokenRecord.expires_at)
      if (exp.isValid && exp.toMillis() < Date.now()) {
        await Database.from('auth_access_tokens').where('id', tokenRecord.id).delete()
        throw new AuthenticationException('存取權杖已過期，請重新登入', 'E_TOKEN_EXPIRED')
      }
    }

    // 查驗對應的使用者帳號
    const user = await Database.from('users').where('id', tokenRecord.tokenable_id).first()
    if (!user) {
      throw new AuthenticationException('查無此權杖對應之使用者帳號', 'E_USER_NOT_FOUND')
    }

    // SSO 單一連線管制：只要該 Token 發出請求驗證通過，立即自動註銷該使用者的其他所有歷史 Token
    if (this.isSsoEnabled()) {
      await Database.from('auth_access_tokens')
        .where('tokenable_id', tokenRecord.tokenable_id)
        .where('id', '!=', tokenRecord.id)
        .delete()
    }

    // 更新最後使用時間戳
    await Database.from('auth_access_tokens')
      .where('id', tokenRecord.id)
      .update({ last_used_at: dateTime.now().toISO() })

    this.currentAccessToken = tokenRecord
    this.rawToken = token

    const { password, ...safeUser } = user
    return safeUser as UserPayload
  }

  async generate(user: Authenticatable, name = 'OAT Access Token'): Promise<string> {
    if (this.ctx.env) {
      Database.setEnv(this.ctx.env)
    }

    const payload = serializeToJson(user)
    const userId = payload.id
    if (!userId) {
      throw new Error('無法為無有效 ID 的使用者簽發 Access Token')
    }

    // 密碼學安全隨機 32 位元組字串
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    const secret = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('')
    const token = `oat_${secret}`
    const hash = await TokensGuard.hashToken(token)

    const expiresInSeconds = authConfig.guards.tokens.expiresIn
    const expiresAt = expiresInSeconds && expiresInSeconds > 0
      ? dateTime.now().plus({ seconds: expiresInSeconds }).toISO()
      : null

    await Database.from('auth_access_tokens').insert({
      tokenable_id: userId,
      type: 'auth_token',
      name,
      hash,
      abilities: JSON.stringify(['*']),
      expires_at: expiresAt
    })

    return token
  }

  async revoke(all = false): Promise<void> {
    if (this.ctx.env) {
      Database.setEnv(this.ctx.env)
    }

    if (all) {
      const userId = this.currentAccessToken?.tokenable_id || (this.ctx.auth.user as any)?.id
      if (userId) {
        await Database.from('auth_access_tokens').where('tokenable_id', userId).delete()
      }
    } else {
      if (this.currentAccessToken?.id) {
        await Database.from('auth_access_tokens').where('id', this.currentAccessToken.id).delete()
      } else if (this.rawToken) {
        const hash = await TokensGuard.hashToken(this.rawToken)
        await Database.from('auth_access_tokens').where('hash', hash).delete()
      }
    }
  }
}

export class AuthManager<TUser = UserPayload> {
  private currentGuard: 'jwt' | 'tokens' = authConfig.defaultGuard
  public user: TUser | null = null
  private guardsMap = new Map<'jwt' | 'tokens', AuthGuard>()

  constructor(private ctx: HttpContext<TUser>) {}

  use(guardName: 'jwt'): JwtGuard
  use(guardName: 'tokens'): TokensGuard
  use(guardName: 'jwt' | 'tokens'): AuthGuard
  use(guardName?: 'jwt' | 'tokens'): AuthGuard {
    const target = guardName || this.currentGuard
    if (this.guardsMap.has(target)) {
      return this.guardsMap.get(target)!
    }

    const secret = this.ctx.env.JWT_SECRET || this.ctx.env.APP_KEY || appConfig.appKey || 'cf-first-super-secret-adonis-jwt-key'
    let instance: AuthGuard
    if (target === 'tokens') {
      instance = new TokensGuard(this.ctx, secret)
    } else {
      instance = new JwtGuard(this.ctx, secret)
    }

    this.guardsMap.set(target, instance)
    return instance
  }

  async authenticate(guardName?: 'jwt' | 'tokens'): Promise<TUser> {
    const target = guardName || this.currentGuard
    this.currentGuard = target
    const guard = this.use(target)
    const user = (await guard.authenticate()) as TUser
    this.user = user
    return user
  }

  /**
   * 取得已通過驗證的使用者實體，若未驗證則自動拋出 AuthenticationException
   */
  getUserOrFail(): TUser {
    if (!this.user) {
      throw new AuthenticationException('尚未通過身分驗證或 Token 無效', 'E_UNAUTHORIZED_ACCESS')
    }
    return this.user
  }

  async check(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    } catch {
      return false
    }
  }

  async login(user: Authenticatable, guardName?: 'jwt' | 'tokens'): Promise<string> {
    const target = guardName || this.currentGuard
    this.currentGuard = target
    const guard = this.use(target)
    const payload = serializeToJson(user)
    this.user = payload as TUser
    return await guard.generate(payload)
  }

  /**
   * 登出與註銷 Token
   * @param all 是否登出該使用者名下所有裝置 (預設為 false，僅登出當前裝置)
   */
  async logout(all = false): Promise<void> {
    if (!this.user) {
      await this.authenticate()
    }
    const guard = this.use(this.currentGuard)
    await guard.revoke(all)
    this.user = null
  }
}

/**
 * Adonis 風格的 authMiddleware
 */
export function authMiddleware(guardName: 'jwt' | 'tokens' = authConfig.defaultGuard): MiddlewareHandler {
  return async (ctx, next) => {
    await ctx.auth.authenticate(guardName)
    await next()
  }
}
