import { BaseValidator, field } from '../../core/validator'

export class CreateNoteValidator extends BaseValidator {
  @field({
    optional: true
  })
  user_id?: number

  @field({
    required: '請輸入筆記標題',
    minLength: [3, '筆記標題長度至少需 3 個字元']
  })
  title!: string

  @field({
    required: '請輸入筆記內容',
    minLength: [5, '筆記內容長度至少需 5 個字元']
  })
  content!: string
}

export class UpdateNoteValidator extends BaseValidator {
  @field({
    optional: true,
    minLength: [3, '筆記標題長度至少需 3 個字元']
  })
  title?: string

  @field({
    optional: true,
    minLength: [5, '筆記內容長度至少需 5 個字元']
  })
  content?: string
}
