import { BaseController } from '../../core/controller'
import type { HttpContext } from '../../core/types'
import { RegisterValidator, LoginValidator } from '../validators/auth_validator'
import { User } from '../models/user'
import { AuthenticationException } from '../../core/exception_handler'

export default class AuthController extends BaseController {
  async register(ctx: HttpContext) {
    const payload = await this.validate(RegisterValidator, await ctx.request.all())

    // 檢查 Email 是否已存在
    const existing = await User.findBy('email', payload.email)
    if (existing) {
      return ctx.response.status(400).json({
        message: '此 Email 已經註冊過',
        code: 'E_EMAIL_TAKEN'
      })
    }

    const user = await User.create({
      email: payload.email,
      password: payload.password,
      full_name: payload.fullName || '新進會員'
    })

    const token = await ctx.auth.login(user)

    return ctx.response.status(201).json({
      message: '會員註冊成功',
      user: user.toJSON(),
      token
    })
  }

  async login(ctx: HttpContext) {
    const payload = await this.validate(LoginValidator, await ctx.request.all())

    const user = await User.findBy('email', payload.email)
    if (!user || user.password !== payload.password) {
      throw new AuthenticationException('帳號或密碼錯誤', 'E_INVALID_CREDENTIALS')
    }

    const token = await ctx.auth.login(user)

    return ctx.response.json({
      message: '登入成功',
      user: user.toJSON(),
      token
    })
  }

  async me(ctx: HttpContext) {
    return ctx.response.json({
      message: '成功通過 Auth Guard 身分驗證',
      user: ctx.auth.user
    })
  }
}
