import { DateTime, Duration, Interval } from 'luxon'
import { appConfig } from '../config/app'

export class TimeService {
  private defaultZone: string

  constructor(defaultZone?: string) {
    this.defaultZone = defaultZone || appConfig.timezone || 'Asia/Taipei'
  }

  /**
   * 取得目前設定的預設時區 (例如 'Asia/Taipei')
   */
  public getTimezone(): string {
    return this.defaultZone
  }

  /**
   * 動態調整預設時區
   */
  public setTimezone(zone: string): void {
    this.defaultZone = zone
  }

  /**
   * 產生目前時間之 Luxon DateTime 物件（預設套用專案設定之時區）
   */
  public now(zone?: string): DateTime {
    return DateTime.now().setZone(zone || this.defaultZone)
  }

  /**
   * 將 ISO 8601 字串解析為 Luxon DateTime 物件
   */
  public fromISO(isoString: string, zone?: string): DateTime {
    return DateTime.fromISO(isoString, { zone: zone || this.defaultZone })
  }

  /**
   * 將原生 JavaScript Date 物件轉為 Luxon DateTime 物件
   */
  public fromJSDate(date: Date, zone?: string): DateTime {
    return DateTime.fromJSDate(date, { zone: zone || this.defaultZone })
  }

  /**
   * 將毫秒時間戳轉為 Luxon DateTime 物件
   */
  public fromMillis(ms: number, zone?: string): DateTime {
    return DateTime.fromMillis(ms, { zone: zone || this.defaultZone })
  }

  /**
   * 將 SQL 格式時間字串 (如 '2026-09-11 12:00:00') 解析為 Luxon DateTime 物件
   */
  public fromSQL(sqlString: string, zone?: string): DateTime {
    return DateTime.fromSQL(sqlString, { zone: zone || this.defaultZone })
  }

  /**
   * 格式化 Luxon DateTime 物件
   * 預設為 'yyyy-MM-dd HH:mm:ss'
   */
  public format(dt: DateTime, formatString: string = 'yyyy-MM-dd HH:mm:ss'): string {
    return dt.toFormat(formatString)
  }

  /**
   * 驗證 DateTime 是否合法
   */
  public isValid(dt: DateTime): boolean {
    return dt.isValid
  }
}

/**
 * 預設時間服務單例
 */
export const dateTime = new TimeService()

// 重新導出 Luxon 原生類別以供彈性使用
export { DateTime, Duration, Interval }
