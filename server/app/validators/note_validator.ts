import { BaseValidator, field, vine } from '../../core/validator'

export class CreateNoteValidator extends BaseValidator {
  static schema = vine.object({
    title: vine.string().minLength(3),
    content: vine.string().minLength(5)
  })

  @field(vine.string().minLength(3))
  title!: string

  @field(vine.string().minLength(5))
  content!: string
}

export class UpdateNoteValidator extends BaseValidator {
  static schema = vine.object({
    title: vine.string().minLength(3).optional(),
    content: vine.string().minLength(5).optional()
  })

  @field(vine.string().minLength(3).optional())
  title?: string

  @field(vine.string().minLength(5).optional())
  content?: string
}
