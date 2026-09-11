import { BaseValidator, field, vine } from '../../core/validator'

export class RegisterValidator extends BaseValidator {
  static schema = vine.object({
    email: vine.string().email(),
    password: vine.string().minLength(6),
    fullName: vine.string().optional()
  })

  @field(vine.string().email())
  email!: string

  @field(vine.string().minLength(6))
  password!: string

  @field(vine.string().optional())
  fullName?: string
}

export class LoginValidator extends BaseValidator {
  static schema = vine.object({
    email: vine.string().email(),
    password: vine.string().minLength(6)
  })

  @field(vine.string().email())
  email!: string

  @field(vine.string().minLength(6))
  password!: string
}
