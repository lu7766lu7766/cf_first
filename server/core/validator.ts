import vine from '@vinejs/vine'
import { ValidationException } from './exception_handler'

const VINE_FIELDS_KEY = Symbol('adonis:vine_fields')

/**
 * 欄位裝飾器：在 Class DTO 屬性上宣告 VineJS 規則
 * 同時相容 TypeScript Legacy 裝飾器與 Stage 3 裝飾器標準
 */
export function field(schemaBuilder: any) {
  return function (target: any, contextOrProp: any) {
    if (typeof contextOrProp === 'object' && contextOrProp !== null && 'name' in contextOrProp) {
      // Stage 3 decorator
      const propName = String(contextOrProp.name)
      if (typeof contextOrProp.addInitializer === 'function') {
        contextOrProp.addInitializer(function (this: any) {
          const existing = Reflect.getMetadata(VINE_FIELDS_KEY, this.constructor) || {}
          existing[propName] = schemaBuilder
          Reflect.defineMetadata(VINE_FIELDS_KEY, existing, this.constructor)
        })
      }
    } else {
      // TypeScript Legacy decorator
      const existing = Reflect.getMetadata(VINE_FIELDS_KEY, target.constructor) || {}
      existing[contextOrProp] = schemaBuilder
      Reflect.defineMetadata(VINE_FIELDS_KEY, existing, target.constructor)
    }
  }
}

const compiledValidatorsMap = new Map<any, any>()

/**
 * Class-based Validator 基底類別
 */
export class BaseValidator {
  static schema: any = null

  /**
   * 取得或編譯 VineJS 驗證器
   */
  static getValidator() {
    if (compiledValidatorsMap.has(this)) {
      return compiledValidatorsMap.get(this)
    }

    let compiled: any
    if (this.schema) {
      compiled = vine.compile(this.schema)
    } else {
      const fields = Reflect.getMetadata(VINE_FIELDS_KEY, this) || {}
      if (Object.keys(fields).length > 0) {
        compiled = vine.compile(vine.object(fields))
      } else {
        compiled = vine.compile(vine.object({}))
      }
    }

    compiledValidatorsMap.set(this, compiled)
    return compiled
  }

  /**
   * 驗證傳入資料
   */
  static async validate<T = any>(this: new () => T, data: any): Promise<T> {
    const validator = (this as any).getValidator()
    try {
      return (await validator.validate(data)) as T
    } catch (err: any) {
      if (err.messages && Array.isArray(err.messages)) {
        const errors = err.messages.map((m: any) => ({
          field: m.field,
          message: m.message,
          rule: m.rule
        }))
        throw new ValidationException(errors)
      }
      throw err
    }
  }
}

/**
 * 便捷驗證方法：validate(ValidatorClass, data)
 */
export async function validate<T>(validatorClass: (new () => T) | { validate: (data: any) => Promise<T> }, data: any): Promise<T> {
  return await (validatorClass as any).validate(data)
}

export { vine }
