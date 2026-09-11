import { BaseModel } from '../../core/model'

export class Note extends BaseModel {
  static table = 'notes'
  static primaryKey = 'id'

  declare id: number
  declare title: string
  declare content: string
  declare created_at: string
}
