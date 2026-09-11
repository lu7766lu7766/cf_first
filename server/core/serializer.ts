import { DateTime } from 'luxon'

/**
 * 深層遞迴序列化函式
 * - 自動將具有 toJSON() 的 Model 或物件轉為 JSON
 * - 自動將 Luxon DateTime 實例轉為 ISO-8601 時間字串
 * - 支援遞迴解析巢狀物件與陣列
 * - 使用 WeakSet 防止循環參照
 */
export function serializeToJson(value: any, seen: Set<object> = new Set()): any {
  if (value === null || value === undefined) {
    return value
  }

  // Luxon DateTime 實體
  if (DateTime.isDateTime(value)) {
    return value.toISO()
  }

  // 基本原生型別
  if (typeof value !== 'object') {
    return value
  }

  // 如果物件正在當前調用鏈路徑中，防止循環參照
  if (seen.has(value)) {
    return undefined
  }

  // 判斷是否具備 toJSON 方法（例如 BaseModel）
  if (typeof (value as any).toJSON === 'function') {
    const nextSeen = new Set(seen)
    nextSeen.add(value)
    const jsonResult = (value as any).toJSON()
    return serializeToJson(jsonResult, nextSeen)
  }

  // 陣列處理
  if (Array.isArray(value)) {
    const nextSeen = new Set(seen)
    nextSeen.add(value)
    return value.map((item) => serializeToJson(item, nextSeen))
  }

  // 普通物件處理
  const nextSeen = new Set(seen)
  nextSeen.add(value)
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(value)) {
    // 忽略函式或 symbol 屬性
    if (typeof val !== 'function') {
      result[key] = serializeToJson(val, nextSeen)
    }
  }

  return result
}
