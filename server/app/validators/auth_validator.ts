import { BaseValidator, field } from '../../core/validator'

/**
 * 會員註冊驗證器
 * 純裝飾器配置，支援多重規則檢驗、自定義錯誤訊息與自定義驗證函式 (custom)
 */
export class RegisterValidator extends BaseValidator {
  @field({
    required: '請輸入使用者帳號',
    minLength: [3, '帳號長度至少需 3 個字元'],
    maxLength: [20, '帳號長度不可超過 20 個字元'],
    // 自定義驗證規則 (custom)：例如禁止使用保留名稱
    custom: (val: unknown) => {
      if (typeof val === 'string' && val.trim().toLowerCase() === 'admin') {
        return '為維護系統安全，不可使用 admin 作為使用者帳號'
      }
      return true
    }
  })
  username!: string

  @field({
    optional: true,
    email: '電子郵件格式不正確，請輸入有效信箱'
  })
  email?: string

  @field({
    required: '密碼為必填欄位',
    minLength: [3, '密碼長度不能小於 3 個字元'],
    maxLength: [50, '密碼長度不可超過 50 個字元']
  })
  password!: string

  @field({
    optional: true,
    maxLength: [50, '姓名長度不可超過 50 個字元']
  })
  fullName?: string
}

/**
 * 會員登入驗證器
 * 純裝飾器配置
 */
export class LoginValidator extends BaseValidator {
  @field({
    required: '請輸入帳號',
    minLength: [3, '帳號長度至少需 3 個字元']
  })
  username!: string

  @field({
    optional: true,
    email: '電子郵件格式不正確，請輸入有效信箱'
  })
  email?: string

  @field({
    required: '請輸入登入密碼',
    minLength: [3, '密碼長度不能小於 3 個字元']
  })
  password!: string
}
