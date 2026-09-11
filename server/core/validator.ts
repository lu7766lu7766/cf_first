import { ValidationException } from './exception_handler'

export type CustomValidatorFn = (
  value: any,
  data: Record<string, any>
) => boolean | string | Promise<boolean | string>

export interface FieldRuleOptions {
  required?: boolean | string
  optional?: boolean
  minLength?: number | [number, string]
  maxLength?: number | [number, string]
  email?: boolean | string
  number?: boolean | string
  positive?: boolean | string
  min?: number | [number, string]
  max?: number | [number, string]
  regex?: RegExp | [RegExp, string]
  confirmed?: string | [string, string]
  custom?: CustomValidatorFn | [CustomValidatorFn, string]
  [key: string]: any
}

export interface ValidationErrorItem {
  field: string
  rule: string
  message: string
}

const VALIDATOR_FIELDS_KEY = Symbol.for('adonis:validator_fields')

export function getValidatorFields(validatorClass: any): Record<string, FieldRuleOptions> {
  if (!validatorClass) return {}
  if (!validatorClass[VALIDATOR_FIELDS_KEY]) {
    try {
      new validatorClass()
    } catch {}
  }
  return validatorClass[VALIDATOR_FIELDS_KEY] || {}
}

export function defineFieldRule(target: any, propName: string, rules: FieldRuleOptions) {
  const ctor = typeof target === 'function' ? target : (target?.constructor || target)
  if (!ctor) return
  if (!ctor[VALIDATOR_FIELDS_KEY]) {
    ctor[VALIDATOR_FIELDS_KEY] = {}
  }
  ctor[VALIDATOR_FIELDS_KEY][propName] = rules
}

/**
 * 宣告欄位驗證規則裝飾器
 * 支援多重內建規則、自定義錯誤訊息與 custom 自定義驗證函式
 * 同時相容 TypeScript 5 Stage 3 與 Legacy 裝飾器
 */
export function field(ruleOptions: FieldRuleOptions | any) {
  return function (targetOrValue: any, contextOrProp: any) {
    if (typeof contextOrProp === 'object' && contextOrProp !== null && 'name' in contextOrProp) {
      // Stage 3 Decorator
      const propName = String(contextOrProp.name)
      if (typeof contextOrProp.addInitializer === 'function') {
        contextOrProp.addInitializer(function (this: any) {
          defineFieldRule(this.constructor, propName, ruleOptions)
        })
      }
      return targetOrValue
    } else {
      // Legacy Decorator
      const propName = String(contextOrProp)
      const ctor = targetOrValue?.constructor || targetOrValue
      defineFieldRule(ctor, propName, ruleOptions)
    }
  }
}

/**
 * Class-based Validator 基底類別
 * 純裝飾器驅動，完全不需宣告 static schema
 */
export class BaseValidator {
  /**
   * 驗證傳入資料並套用自定義錯誤訊息
   */
  static async validate<T = any>(this: new () => T, data: any): Promise<T> {
    const input = (data && typeof data === 'object') ? data : {}
    const rulesConfig = getValidatorFields(this)
    const errors: ValidationErrorItem[] = []

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const [fieldName, rules] of Object.entries(rulesConfig)) {
      // 若傳入的是 legacy schema builder 物件，跳過宣告式驗證
      if (!rules || typeof rules !== 'object' || 'getSchema' in rules) continue

      const val = input[fieldName]
      const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '')

      // 1. 檢查 optional
      if (rules.optional && isEmpty) {
        continue
      }

      // 2. 檢查 required
      if (rules.required !== undefined && rules.required !== false) {
        if (isEmpty) {
          const msg = typeof rules.required === 'string'
            ? rules.required
            : `請輸入${fieldName}`
          errors.push({ field: fieldName, rule: 'required', message: msg })
          continue // 必填未填則跳過後續規則
        }
      }

      // 若非必填但為空，且未宣告 optional，跳過內容檢查
      if (isEmpty) {
        continue
      }

      const strVal = String(val)

      // 3. 檢查 minLength
      if (rules.minLength !== undefined) {
        let min = 0
        let msg = ''
        if (Array.isArray(rules.minLength)) {
          min = rules.minLength[0]
          msg = rules.minLength[1]
        } else {
          min = Number(rules.minLength)
          msg = `${fieldName} 長度至少需 ${min} 個字元`
        }
        if (strVal.length < min) {
          errors.push({ field: fieldName, rule: 'minLength', message: msg })
        }
      }

      // 4. 檢查 maxLength
      if (rules.maxLength !== undefined) {
        let max = 0
        let msg = ''
        if (Array.isArray(rules.maxLength)) {
          max = rules.maxLength[0]
          msg = rules.maxLength[1]
        } else {
          max = Number(rules.maxLength)
          msg = `${fieldName} 長度不可超過 ${max} 個字元`
        }
        if (strVal.length > max) {
          errors.push({ field: fieldName, rule: 'maxLength', message: msg })
        }
      }

      // 5. 檢查 email
      if (rules.email !== undefined && rules.email !== false) {
        if (!emailRegex.test(strVal)) {
          const msg = typeof rules.email === 'string'
            ? rules.email
            : `${fieldName} 必須是有效的電子郵件格式`
          errors.push({ field: fieldName, rule: 'email', message: msg })
        }
      }

      // 6. 檢查 number
      if (rules.number !== undefined && rules.number !== false) {
        if (isNaN(Number(val))) {
          const msg = typeof rules.number === 'string' ? rules.number : `${fieldName} 必須為數值`
          errors.push({ field: fieldName, rule: 'number', message: msg })
        }
      }

      // 7. 檢查 regex
      if (rules.regex !== undefined) {
        let regex: RegExp
        let msg = `${fieldName} 格式不符合規範`
        if (Array.isArray(rules.regex)) {
          regex = rules.regex[0]
          msg = rules.regex[1]
        } else {
          regex = rules.regex
        }
        if (!regex.test(strVal)) {
          errors.push({ field: fieldName, rule: 'regex', message: msg })
        }
      }

      // 8. 檢查 confirmed (例如 password_confirmation)
      if (rules.confirmed !== undefined) {
        let confirmField = `${fieldName}_confirmation`
        let msg = `${fieldName} 與確認欄位不一致`
        if (Array.isArray(rules.confirmed)) {
          confirmField = rules.confirmed[0]
          msg = rules.confirmed[1]
        } else if (typeof rules.confirmed === 'string') {
          confirmField = rules.confirmed
        }
        if (input[confirmField] !== val) {
          errors.push({ field: fieldName, rule: 'confirmed', message: msg })
        }
      }

      // 9. 檢查 custom 自定義規則
      if (rules.custom !== undefined) {
        let customFn: CustomValidatorFn
        let customFallbackMsg = `${fieldName} 未通過自訂規則驗證`
        if (Array.isArray(rules.custom)) {
          customFn = rules.custom[0]
          customFallbackMsg = rules.custom[1]
        } else {
          customFn = rules.custom
        }

        try {
          const result = await customFn(val, input)
          if (typeof result === 'string') {
            errors.push({ field: fieldName, rule: 'custom', message: result })
          } else if (result === false) {
            errors.push({ field: fieldName, rule: 'custom', message: customFallbackMsg })
          }
        } catch (e: any) {
          errors.push({
            field: fieldName,
            rule: 'custom',
            message: e?.message || customFallbackMsg
          })
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationException(errors)
    }

    return input as T
  }
}

/**
 * 便捷驗證方法：validate(ValidatorClass, data)
 */
export async function validate<T>(
  validatorClass: (new () => T) | { validate: (data: any) => Promise<T> },
  data: any
): Promise<T> {
  return await (validatorClass as any).validate(data)
}
