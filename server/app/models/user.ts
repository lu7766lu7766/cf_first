import { BaseModel } from '../../core/model'
import type { DateTime } from '../../core/time'
import { hasMany, type HasMany } from '../../core/relations'
import { Note } from './note'

export class User extends BaseModel {
  static table = 'users'
  static primaryKey = 'id'

  /**
   * 自訂帳號欄位名稱（預設為 email，本專案設定為 username）
   */
  static usernameColumn: string = 'username'

  /**
   * 自訂密碼欄位名稱（預設為 password）
   */
  static passwordColumn: string = 'password'

  /**
   * 序列化輸出時需排除的機密欄位
   */
  static hidden: string[] = ['password']

  static getUsernameColumn(): string {
    return this.usernameColumn || 'email'
  }

  static getPasswordColumn(): string {
    return this.passwordColumn || 'password'
  }

  declare id: number
  declare username: string
  declare email: string
  declare password: string
  declare full_name: string

  declare created_at: DateTime
  declare updated_at: DateTime

  /**
   * 使用者的一對多筆記關聯
   */
  @hasMany(() => Note, { foreignKey: 'user_id' })
  notes!: HasMany<Note>
}
