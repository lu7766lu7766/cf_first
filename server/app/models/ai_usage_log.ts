import { BaseModel } from '../../core/model'
import type { DateTime } from '../../core/time'

export class AiUsageLog extends BaseModel {
  static table = 'ai_usage_logs'
  static primaryKey = 'id'

  declare id: number
  declare user_id: number | null
  declare model: string
  declare prompt: string
  declare response: string
  declare tokens_used: number
  declare duration_ms: number
  declare is_mock: number
  declare status: string

  declare created_at: DateTime
  declare updated_at: DateTime
}
