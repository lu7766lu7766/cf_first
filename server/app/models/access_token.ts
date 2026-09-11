import { BaseModel } from '../../core/model'
import { dateTime, DateTime } from '../../core/time'
import { belongsTo, type BelongsTo } from '../../core/relations'
import { User } from './user'

export class AccessToken extends BaseModel {
  static table = 'auth_access_tokens'
  static primaryKey = 'id'
  static hidden = ['hash']

  declare id: number
  declare tokenable_id: number
  declare type: string
  declare name: string | null
  declare hash: string
  declare abilities: string
  declare created_at: DateTime
  declare updated_at: DateTime
  declare last_used_at: DateTime | null
  declare expires_at: DateTime | null

  /**
   * 所屬使用者關聯
   */
  @belongsTo(() => User, { foreignKey: 'tokenable_id' })
  user!: BelongsTo<User>

  /**
   * 檢查 Token 是否已經過期
   */
  isExpired(): boolean {
    if (!this.expires_at) return false
    const exp = typeof this.expires_at === 'string' ? dateTime.fromISO(this.expires_at) : this.expires_at
    return exp.toMillis() < Date.now()
  }

  /**
   * 檢查 Token 是否具備特定權限
   */
  hasAbility(ability: string): boolean {
    try {
      const list = JSON.parse(this.abilities || '["*"]')
      return list.includes('*') || list.includes(ability)
    } catch {
      return false
    }
  }
}
