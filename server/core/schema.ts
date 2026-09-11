import knex, { type Knex } from 'knex'

/**
 * AdonisJS 7 風格的 Class-based Schema 遷移基底類別
 * 底層採用 Knex Schema Builder，可編譯為 SQLite / D1 DDL
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
   * 編譯 up() 所產生的所有 SQL DDL 語句陣列
   */
  async compileUp(): Promise<string[]> {
    this.schema = this.knexInstance.schema
    await this.up()
    const queries = this.schema.toSQL()
    return queries.map((q) => q.sql)
  }

  /**
   * 編譯 down() 所產生的所有 SQL DDL 語句陣列
   */
  async compileDown(): Promise<string[]> {
    this.schema = this.knexInstance.schema
    await this.down()
    const queries = this.schema.toSQL()
    return queries.map((q) => q.sql)
  }
}
