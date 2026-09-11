import { validate } from './validator'

export class BaseController {
  /**
   * 捷徑：驗證輸入資料並回傳強型別 Payload
   */
  async validate<T>(validator: new () => T, data: any): Promise<T>
  async validate<T>(validator: { validate: (data: any) => Promise<T> }, data: any): Promise<T>
  async validate<T>(validator: any, data: any): Promise<T> {
    return await validate<T>(validator, data)
  }
}
