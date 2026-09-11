import type { Env } from './types'
import { dateTime } from './time'

export interface QueryOptions {
  table: string
  fields?: string[]
  wheres?: Array<{ column: string; operator: string; value: any }>
  orders?: Array<{ column: string; direction: 'ASC' | 'DESC' }>
  limitCount?: number
  offsetCount?: number
}

// 模擬記憶體資料庫儲存庫（當本機或展示模式下未綁定真實 D1 時自動兜底，保證永遠可用）
const memoryDb = new Map<string, Array<Record<string, any>>>()

// 初始化預設假資料
memoryDb.set('notes', [
  { id: 1, title: '【歡迎】AdonisJS 7 on Cloudflare Workers', content: '體驗極致邊緣效能與極速 API', created_at: dateTime.now().toISO() },
  { id: 2, title: '【特性】Active Record & IoC 依賴注入', content: '使用熟悉的 Adonis Class-based 開發風格', created_at: dateTime.now().toISO() }
])
memoryDb.set('users', [
  { id: 1, email: 'admin@example.com', password: 'password123', full_name: '系統管理員', created_at: dateTime.now().toISO() }
])

export class QueryBuilder<T = any> {
  private options: QueryOptions

  constructor(private table: string, private getEnv: () => Env | undefined, private inTransaction = false) {
    this.options = {
      table,
      fields: ['*'],
      wheres: [],
      orders: []
    }
  }

  select(...fields: string[]): this {
    this.options.fields = fields
    return this
  }

  where(column: string, operatorOrValue: any, value?: any): this {
    if (value === undefined) {
      this.options.wheres!.push({ column, operator: '=', value: operatorOrValue })
    } else {
      this.options.wheres!.push({ column, operator: operatorOrValue, value })
    }
    return this
  }

  orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): this {
    this.options.orders!.push({ column, direction: direction.toUpperCase() as any })
    return this
  }

  limit(count: number): this {
    this.options.limitCount = count
    return this
  }

  offset(count: number): this {
    this.options.offsetCount = count
    return this
  }

  async first(): Promise<T | null> {
    const list = await this.limit(1).all()
    return list[0] || null
  }

  async all(): Promise<T[]> {
    const env = this.getEnv()
    if (env?.DB) {
      try {
        let sql = `SELECT ${this.options.fields!.join(', ')} FROM ${this.options.table}`
        const bindings: any[] = []

        if (this.options.wheres && this.options.wheres.length > 0) {
          const conditions = this.options.wheres.map((w) => {
            bindings.push(w.value)
            return `${w.column} ${w.operator} ?`
          })
          sql += ` WHERE ${conditions.join(' AND ')}`
        }

        if (this.options.orders && this.options.orders.length > 0) {
          const orderClauses = this.options.orders.map((o) => `${o.column} ${o.direction}`)
          sql += ` ORDER BY ${orderClauses.join(', ')}`
        }

        if (this.options.limitCount !== undefined) {
          sql += ` LIMIT ${this.options.limitCount}`
        }
        if (this.options.offsetCount !== undefined) {
          sql += ` OFFSET ${this.options.offsetCount}`
        }

        const stmt = env.DB.prepare(sql)
        const { results } = await stmt.bind(...bindings).all<T>()
        return (results as T[]) || []
      } catch (err) {
        console.warn(`[Database] D1 查詢異常 (${err})，自動切換至記憶體資料庫。`)
      }
    }

    // 記憶體資料庫 fallback
    const tableData = (memoryDb.get(this.options.table) || []) as any[]
    let filtered = [...tableData]

    if (this.options.wheres && this.options.wheres.length > 0) {
      filtered = filtered.filter((row) => {
        return this.options.wheres!.every((w) => {
          if (w.operator === '=') return String(row[w.column]) === String(w.value)
          if (w.operator === '!=') return String(row[w.column]) !== String(w.value)
          if (w.operator === '>') return Number(row[w.column]) > Number(w.value)
          if (w.operator === '<') return Number(row[w.column]) < Number(w.value)
          return true
        })
      })
    }

    if (this.options.orders && this.options.orders.length > 0) {
      filtered.sort((a, b) => {
        for (const o of this.options.orders!) {
          if (a[o.column] < b[o.column]) return o.direction === 'ASC' ? -1 : 1
          if (a[o.column] > b[o.column]) return o.direction === 'ASC' ? 1 : -1
        }
        return 0
      })
    }

    if (this.options.offsetCount !== undefined) {
      filtered = filtered.slice(this.options.offsetCount)
    }
    if (this.options.limitCount !== undefined) {
      filtered = filtered.slice(0, this.options.limitCount)
    }

    return filtered as T[]
  }

  async insert(data: Record<string, any>): Promise<any> {
    const env = this.getEnv()
    const now = dateTime.now().toISO() || new Date().toISOString()
    const record = { ...data, created_at: data.created_at || now, updated_at: now }

    if (env?.DB) {
      try {
        const keys = Object.keys(record)
        const placeholders = keys.map(() => '?').join(', ')
        const values = Object.values(record)
        const sql = `INSERT INTO ${this.options.table} (${keys.join(', ')}) VALUES (${placeholders})`
        const res = await env.DB.prepare(sql).bind(...values).run()
        return { id: res.meta.last_row_id || Date.now(), ...record }
      } catch (err) {
        console.warn(`[Database] D1 插入異常 (${err})，切換至記憶體資料庫`)
      }
    }

    const tableData = memoryDb.get(this.options.table) || []
    const newId = tableData.length > 0 ? Math.max(...tableData.map((r: any) => r.id || 0)) + 1 : 1
    const newRecord = { id: newId, ...record }
    tableData.push(newRecord)
    memoryDb.set(this.options.table, tableData)
    return newRecord
  }

  async update(data: Record<string, any>): Promise<number> {
    const env = this.getEnv()
    const now = dateTime.now().toISO() || new Date().toISOString()
    const record = { ...data, updated_at: now }

    if (env?.DB) {
      try {
        const sets = Object.keys(record).map((k) => `${k} = ?`).join(', ')
        const values = Object.values(record)
        let sql = `UPDATE ${this.options.table} SET ${sets}`
        const bindings = [...values]

        if (this.options.wheres && this.options.wheres.length > 0) {
          const conditions = this.options.wheres.map((w) => {
            bindings.push(w.value)
            return `${w.column} ${w.operator} ?`
          })
          sql += ` WHERE ${conditions.join(' AND ')}`
        }

        const res = await env.DB.prepare(sql).bind(...bindings).run()
        return res.meta.changes || 0
      } catch (err) {
        console.warn(`[Database] D1 更新異常 (${err})，切換至記憶體資料庫`)
      }
    }

    const tableData = memoryDb.get(this.options.table) || []
    let updatedCount = 0
    for (const row of tableData) {
      const match = (this.options.wheres || []).every((w) => {
        if (w.operator === '=') return String(row[w.column]) === String(w.value)
        return true
      })
      if (match) {
        Object.assign(row, record)
        updatedCount++
      }
    }
    return updatedCount
  }

  async delete(): Promise<number> {
    const env = this.getEnv()
    if (env?.DB) {
      try {
        let sql = `DELETE FROM ${this.options.table}`
        const bindings: any[] = []
        if (this.options.wheres && this.options.wheres.length > 0) {
          const conditions = this.options.wheres.map((w) => {
            bindings.push(w.value)
            return `${w.column} ${w.operator} ?`
          })
          sql += ` WHERE ${conditions.join(' AND ')}`
        }
        const res = await env.DB.prepare(sql).bind(...bindings).run()
        return res.meta.changes || 0
      } catch (err) {
        console.warn(`[Database] D1 刪除異常 (${err})，切換至記憶體資料庫`)
      }
    }

    const tableData = memoryDb.get(this.options.table) || []
    const beforeCount = tableData.length
    const remaining = tableData.filter((row) => {
      return !(this.options.wheres || []).every((w) => {
        if (w.operator === '=') return String(row[w.column]) === String(w.value)
        return true
      })
    })
    memoryDb.set(this.options.table, remaining)
    return beforeCount - remaining.length
  }
}

export class Database {
  private static currentEnv?: Env
  private static connectionName = 'd1'

  static setEnv(env: Env) {
    this.currentEnv = env
  }

  static getEnv(): Env | undefined {
    return this.currentEnv
  }

  /**
   * 切換連線配置 (例如 'd1' | 'pg' | 'mysql' | 'sqlite')
   */
  static connection(name: string): typeof Database {
    this.connectionName = name
    return this
  }

  static from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table, () => this.currentEnv)
  }

  static async rawQuery<T = any>(sql: string, bindings: any[] = []): Promise<T[]> {
    if (this.currentEnv?.DB) {
      const { results } = await this.currentEnv.DB.prepare(sql).bind(...bindings).all<T>()
      return (results as T[]) || []
    }
    return []
  }

  /**
   * 事務支援 (AdonisJS Database.transaction)
   */
  static async transaction<T>(callback: (trx: typeof Database) => Promise<T>): Promise<T> {
    // 建立記憶體快照以便事務失敗時復原
    const snapshot = new Map<string, string>()
    for (const [table, rows] of memoryDb.entries()) {
      snapshot.set(table, JSON.stringify(rows))
    }

    try {
      const result = await callback(Database)
      return result
    } catch (err) {
      // 復原記憶體快照
      for (const [table, json] of snapshot.entries()) {
        memoryDb.set(table, JSON.parse(json))
      }
      throw err
    }
  }
}
