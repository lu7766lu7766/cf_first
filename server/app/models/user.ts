import { BaseModel } from '../../core/model'

export class User extends BaseModel {
  static table = 'users'
  static primaryKey = 'id'

  declare id: number
  declare email: string
  declare password: string
  declare full_name: string
  declare created_at: string
}
