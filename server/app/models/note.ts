import { BaseModel } from '../../core/model'
import type { DateTime } from '../../core/time'
import { belongsTo, type BelongsTo } from '../../core/relations'
import { User } from './user'

export class Note extends BaseModel {
  static table = 'notes'
  static primaryKey = 'id'

  declare id: number
  declare user_id: number | null
  declare title: string
  declare content: string

  declare created_at: DateTime
  declare updated_at: DateTime

  /**
   * 所屬使用者多對一關聯
   */
  @belongsTo(() => User, { foreignKey: 'user_id' })
  user!: BelongsTo<User>
}
