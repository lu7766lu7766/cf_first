import knex, { type Knex } from 'knex'

export type KnexClientType = 'sqlite3' | 'pg' | 'mysql2'

/**
 * AdonisJS 7 風格的 Class-based Schema 遷移基底類別
 * 底層採用 Knex Schema Builder，可編譯為 SQLite / D1 / PostgreSQL / MySQL DDL
 */
export abstract class BaseSchema {
  protected knexInstance: Knex = knex({ client: 'sqlite3', useNullAsDefault: true })
  public schema: Knex.SchemaBuilder = this.knexInstance.schema

  /**
   * 當前時間戳輔助器 (CURRENT_TIMESTAMP)
   */
  now() {
    return this.knexInstance.fn.now()
  }

  /**
   * 向上遷移
   */
  abstract up(): Promise<void> | void

  /**
   * 向下回滾
   */
  abstract down(): Promise<void> | void

  /**
   * 初始化指定目標方言之 Knex 實例
   */
  protected setupClient(clientName: KnexClientType = 'sqlite3') {
    this.knexInstance = knex({
      client: clientName,
      useNullAsDefault: clientName === 'sqlite3'
    })
    this.schema = this.knexInstance.schema
  }

  /**
   * 編譯 up() 所產生的所有 SQL DDL 語句陣列，支援目標資料庫方言
   */
  async compileUp(clientName: KnexClientType = 'sqlite3'): Promise<string[]> {
    this.setupClient(clientName)
    await this.up()
    const queries = this.schema.toSQL()
    return queries.map((q) => {
      let sql = q.sql.trim()
      // 為 SQLite 唯一索引加上 IF NOT EXISTS 防呆相容
      if (clientName === 'sqlite3') {
        if (/^create\s+unique\s+index\s+(?!if\s+not\s+exists)/i.test(sql)) {
          sql = sql.replace(/^create\s+unique\s+index\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        } else if (/^create\s+index\s+(?!if\s+not\s+exists)/i.test(sql)) {
          sql = sql.replace(/^create\s+index\s+/i, 'CREATE INDEX IF NOT EXISTS ')
        } else if (/^create\s+table\s+(?!if\s+not\s+exists)/i.test(sql)) {
          sql = sql.replace(/^create\s+table\s+/i, 'CREATE TABLE IF NOT EXISTS ')
        }
      }
      return sql
    })
  }

  /**
   * 編譯 down() 所產生的所有 SQL DDL 語句陣列
   */
  async compileDown(clientName: KnexClientType = 'sqlite3'): Promise<string[]> {
    this.setupClient(clientName)
    await this.down()
    const queries = this.schema.toSQL()
    return queries.map((q) => {
      let sql = q.sql.trim()
      if (/^drop\s+table\s+(?!if\s+exists)/i.test(sql)) {
        sql = sql.replace(/^drop\s+table\s+/i, 'DROP TABLE IF EXISTS ')
      }
      return sql
    })
  }
}
