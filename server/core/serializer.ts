import { DateTime } from 'luxon'

const IS_SERIALIZED = Symbol.for('app:serialized')

/**
 * 高效深層序列化函式
 * - 自動將具有 toJSON() 的 Model 或物件轉為 JSON
 * - 自動將 Luxon DateTime 實例轉為 ISO-8601 時間字串
 * - 透過 Stack-based Set 消除反覆 new Set 記憶體配置
 * - 透過 IS_SERIALIZED 標記避免二次重複遍歷
 */
export function serializeToJson(value: any, seen?: Set<object>): any {
  if (value === null || value === undefined) {
    return value
  }

  // 基本原生型別
  if (typeof value !== 'object') {
    return value
  }

  // 若已經完成序列化，直接回傳
  if ((value as any)[IS_SERIALIZED]) {
    return value
  }

  // Luxon DateTime 實體
  if (DateTime.isDateTime(value)) {
    return value.toISO()
  }

  if (!seen) {
    seen = new Set()
  }

  // 防止循環參照
  if (seen.has(value)) {
    return undefined
  }

  seen.add(value)

  try {
    // 判斷是否具備 toJSON 方法（例如 BaseModel）
    if (typeof (value as any).toJSON === 'function') {
      const jsonResult = (value as any).toJSON()
      return serializeToJson(jsonResult, seen)
    }

    // 陣列處理
    if (Array.isArray(value)) {
      const arr = value.map((item) => serializeToJson(item, seen))
      Object.defineProperty(arr, IS_SERIALIZED, { value: true, enumerable: false, configurable: true })
      return arr
    }

    // 普通物件處理
    const result: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      if (typeof val !== 'function') {
        result[key] = serializeToJson(val, seen)
      }
    }
    Object.defineProperty(result, IS_SERIALIZED, { value: true, enumerable: false, configurable: true })
    return result
  } finally {
    seen.delete(value)
  }
}
