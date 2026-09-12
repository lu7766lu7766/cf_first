import pg from 'pg'
import type { DatabaseDriver, MigrationRecord, ExecuteResult } from './types'

export interface PostgresDriverConfig {
  connectionString?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

export class PostgresDriver implements DatabaseDriver {
  readonly name = 'postgres'
  readonly knexClient = 'pg' as const

  private pool: pg.Pool

  constructor(config: PostgresDriverConfig = {}) {
    const { Pool } = pg
    if (config.connectionString) {
      this.pool = new Pool({ connectionString: config.connectionString })
    } else {
      this.pool = new Pool({
        host: config.host || '127.0.0.1',
        port: config.port || 5432,
        user: config.user || 'postgres',
        password: config.password || '',
        database: config.database || 'cf_first'
      })
    }
  }

  async executeRaw(sql: string, bindings: any[] = []): Promise<any> {
    try {
      return await this.pool.query(sql, bindings)
    } catch (err: any) {
      throw new Error(`[PostgreSQL 執行失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async query<T = any>(sql: string, bindings: any[] = []): Promise<T[]> {
    try {
      const res = await this.pool.query(sql, bindings)
      return (res.rows as T[]) || []
    } catch (err: any) {
      throw new Error(`[PostgreSQL 查詢失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async executeRun(sql: string, bindings: any[] = []): Promise<ExecuteResult> {
    try {
      const res = await this.pool.query(sql, bindings)
      const lastId = res.rows && res.rows[0] && res.rows[0].id ? Number(res.rows[0].id) : 0
      return {
        changes: res.rowCount || 0,
        last_row_id: lastId
      }
    } catch (err: any) {
      throw new Error(`[PostgreSQL 異動失敗]: ${err.message}\nSQL: ${sql}`)
    }
  }

  async getTableColumns(tableName: string): Promise<string[]> {
    const sql = `
      SELECT column_name as name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = current_schema()
      ORDER BY ordinal_position;
    `
    const rows = await this.query<{ name: string }>(sql, [tableName])
    return rows.map((r) => r.name)
  }

  async getAllTables(): Promise<string[]> {
    const sql = `
      SELECT table_name as name 
      FROM information_schema.tables 
      WHERE table_schema = current_schema() 
        AND table_type = 'BASE TABLE' 
        AND table_name != 'adonis_schema';
    `
    const rows = await this.query<{ name: string }>(sql)
    return rows.map((r) => r.name)
  }

  async dropTable(tableName: string): Promise<void> {
    await this.executeRaw(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`)
  }

  async initSchemaTable(migrationFiles: string[]): Promise<void> {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS adonis_schema (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        batch INTEGER NOT NULL,
        migration_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    const sql = `
      INSERT INTO adonis_schema (name, batch) 
      VALUES ($1, $2) 
      ON CONFLICT (name) DO NOTHING;
    `
    await this.executeRaw(sql, [name, batch])
  }

  async rollbackMigration(name: string): Promise<void> {
    const sql = 'DELETE FROM adonis_schema WHERE name = $1;'
    await this.executeRaw(sql, [name])
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
