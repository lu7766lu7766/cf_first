import { BaseController } from '../../core/controller'
import type { HttpContext } from '../../core/types'
import { RegisterValidator, LoginValidator } from '../validators/auth_validator'
import { User } from '../models/user'
import { Hash } from '../../core/hash'
import { AuthenticationException, HttpException } from '../../core/exception_handler'

export default class AuthController extends BaseController {
  async register(ctx: HttpContext) {
    const payload = await this.validate(RegisterValidator, await ctx.request.all())

    const uCol = User.getUsernameColumn()
    const identifier = payload.username || payload.email || (payload as any)[uCol]

    if (!identifier) {
      throw new HttpException('請提供帳號或電子郵件', 422, 'E_VALIDATION_ERROR')
    }

    // 檢查帳號是否已存在
    const existing = await User.findBy(uCol, identifier)
    if (existing) {
      throw new HttpException(`帳號「${identifier}」已經被註冊過`, 400, 'E_ACCOUNT_TAKEN')
    }

    // 安全雜湊密碼
    const hashedPassword = await Hash.make(payload.password)

    const user = await User.create({
      [uCol]: identifier,
      email: payload.email || (identifier.includes('@') ? identifier : `${identifier}@example.com`),
      password: hashedPassword,
      full_name: payload.fullName || identifier
    })

    const token = await ctx.auth.login(user)

    // 直接返回物件，由核心層與 ApiFormatMiddleware 自動深層序列化
    return {
      message: '會員註冊成功',
      user,
      token
    }
  }

  async login(ctx: HttpContext) {
    const payload = await this.validate(LoginValidator, await ctx.request.all())

    const uCol = User.getUsernameColumn()
    const identifier = payload.username || payload.email || (payload as any)[uCol]

    if (!identifier) {
      throw new HttpException('請提供帳號或電子郵件', 422, 'E_VALIDATION_ERROR')
    }

    // 依帳號欄位查找使用者
    let user = await User.findBy(uCol, identifier)
    if (!user && payload.email) {
      user = await User.findBy('email', payload.email)
    }

    if (!user) {
      throw new AuthenticationException('帳號或密碼錯誤', 'E_INVALID_CREDENTIALS')
    }

    // 安全驗證密碼
    const isPasswordValid = await Hash.verify(payload.password, user.password)
    if (!isPasswordValid) {
      throw new AuthenticationException('帳號或密碼錯誤', 'E_INVALID_CREDENTIALS')
    }

    const token = await ctx.auth.login(user)

    // 直接返回登入成功資訊
    return {
      message: '登入成功',
      user,
      token
    }
  }

  async me(ctx: HttpContext) {
    const authUser = ctx.auth.user
    if (!authUser || !authUser.id) {
      throw new AuthenticationException('尚未通過身分驗證或 Token 無效', 'E_UNAUTHORIZED')
    }

    // 實際從 SQLite 資料庫撈取最新使用者實體資料
    const user = await User.find(authUser.id)
    if (!user) {
      throw new HttpException('資料庫中查無此使用者，可能已被移除', 404, 'E_USER_NOT_FOUND')
    }

    return {
      message: '成功由 SQLite 資料庫取得使用者資料',
      user
    }
  }
}


