import { BaseController } from '../../core/controller'
import type { HttpContext } from '../../core/types'
import { User } from '../models/user'

export default class UsersController extends BaseController {
  /**
   * 取得所有使用者列表 (需要 JWT Auth)
   * 密碼等機密欄位會由 User.hidden 自動排除
   */
  async index(_ctx: HttpContext) {
    const users = await User.all()
    return users
  }
}
