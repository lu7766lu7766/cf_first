import mysql, { type Pool } from 'mysql2/promise'
import type { DatabaseDriver, MigrationRecord, ExecuteResult } from './types'

export interface MySqlDriverConfig {
  connectionString?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

export class MySqlDriver implements DatabaseDriver {
  readonly name = 'mysql'
  readonly knexClient = 'mysql2' as const

  private pool: Pool

  constructor(config: MySqlDriverConfig = {}) {
    if (config.connectionString) {
      this.pool = mysql.createPool(config.connectionString)
    } else {
      this.pool = mysql.createPool({
        host: config.host || '127.0.0.1',
        port: config.port || 3306,
        user: config.user || 'root',
        password: config.password || '',
        database: config.database || 'cf_first',
        waitForConnections: true,
        connectionLimit: 10
      })
    }
  }

  async executeRaw(sql: string, bindings: any[] = []): Promise<any> {
    try {
      return await this.pool.query(sql, bindings)
    } catch (err: any) {
      throw new Error(`[MySQL 執行失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async query<T = any>(sql: string, bindings: any[] = []): Promise<T[]> {
    try {
      const [rows] = await this.pool.query(sql, bindings)
      return (rows as T[]) || []
    } catch (err: any) {
      throw new Error(`[MySQL 查詢失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async executeRun(sql: string, bindings: any[] = []): Promise<ExecuteResult> {
    try {
      const [result]: any = await this.pool.query(sql, bindings)
      return {
        changes: result?.affectedRows || 0,
        last_row_id: result?.insertId || 0
      }
    } catch (err: any) {
      throw new Error(`[MySQL 異動失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async getTableColumns(tableName: string): Promise<string[]> {
    const sql = `
      SELECT column_name as name 
      FROM information_schema.columns 
      WHERE table_name = ? AND table_schema = DATABASE()
      ORDER BY ordinal_position;
    `
    const rows = await this.query<{ name: string }>(sql, [tableName])
    return rows.map((r) => r.name)
  }

  async getAllTables(): Promise<string[]> {
    const sql = `
      SELECT table_name as name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
        AND table_type = 'BASE TABLE' 
        AND table_name != 'adonis_schema';
    `
    const rows = await this.query<{ name: string }>(sql)
    return rows.map((r) => r.name)
  }

  async dropTable(tableName: string): Promise<void> {
    await this.executeRaw(`DROP TABLE IF EXISTS \`${tableName}\`;`)
  }

  async initSchemaTable(migrationFiles: string[]): Promise<void> {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS adonis_schema (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        batch INT NOT NULL,
        migration_time DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `
    await this.executeRaw(createTableSql)
  }

  async getMigratedRecords(): Promise<MigrationRecord[]> {
    const sql = 'SELECT id, name, batch, migration_time FROM adonis_schema ORDER BY id ASC;'
    const rows = await this.query<any>(sql)
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      batch: r.batch,
      migration_time: r.migration_time instanceof Date ? r.migration_time.toISOString() : String(r.migration_time)
    }))
  }

  async recordMigration(name: string, batch: number): Promise<void> {
    const sql = 'INSERT IGNORE INTO adonis_schema (name, batch) VALUES (?, ?);'
    await this.executeRaw(sql, [name, batch])
  }

  async rollbackMigration(name: string): Promise<void> {
    const sql = 'DELETE FROM adonis_schema WHERE name = ?;'
    await this.executeRaw(sql, [name])
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
