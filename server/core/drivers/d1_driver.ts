import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import type { DatabaseDriver, MigrationRecord, ExecuteResult } from './types'

let __dirname = ''
try {
  if (typeof import.meta !== 'undefined' && import.meta?.url) {
    const __filename = fileURLToPath(import.meta.url)
    __dirname = path.dirname(__filename)
  }
} catch {
  __dirname = ''
}

export interface D1DriverOptions {
  isRemote?: boolean
  env?: any
  projectRoot?: string
}

export class D1Driver implements DatabaseDriver {
  readonly name = 'd1'
  readonly knexClient = 'sqlite3' as const

  private isRemote: boolean
  private env?: any
  private projectRoot: string

  constructor(options: D1DriverOptions = {}) {
    this.isRemote = !!options.isRemote
    this.env = options.env
    this.projectRoot = options.projectRoot || (__dirname ? path.resolve(__dirname, '../../../') : (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.'))
  }

  setEnv(env: any) {
    this.env = env
  }

  private findLocalSqlitePath(): string | null {
    if (typeof fs === 'undefined' || typeof fs.existsSync !== 'function') return null
    const d1Dir = path.join(this.projectRoot, '.wrangler/state/v3/d1')
    if (!fs.existsSync(d1Dir)) return null

    const sqliteFiles: Array<{ path: string; mtime: number; score: number }> = []
    const scan = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            scan(fullPath)
          } else if (
            entry.isFile() &&
            entry.name.endsWith('.sqlite') &&
            !entry.name.includes('-shm') &&
            !entry.name.includes('-wal')
          ) {
            const stats = fs.statSync(fullPath)
            let score = stats.mtimeMs
            try {
              const tables = execSync(`sqlite3 "${fullPath}" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('auth_access_tokens', 'users');"`, { stdio: 'pipe' }).toString()
              score += Number(tables.trim()) * 1e11
            } catch {}
            sqliteFiles.push({ path: fullPath, mtime: stats.mtimeMs, score })
          }
        }
      } catch {}
    }

    scan(d1Dir)
    if (sqliteFiles.length === 0) return null
    sqliteFiles.sort((a, b) => b.score - a.score)
    return sqliteFiles[0].path
  }

  private escapeSqlValue(v: any): string {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? '1' : '0'
    if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
    if (v instanceof Date) return `'${v.toISOString()}'`
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
    return `'${String(v).replace(/'/g, "''")}'`
  }

  private interpolateSql(sql: string, bindings: any[] = []): string {
    let idx = 0
    return sql.replace(/\?/g, () => {
      if (idx < bindings.length) {
        return this.escapeSqlValue(bindings[idx++])
      }
      return 'NULL'
    })
  }

  async executeRaw(sql: string, bindings: any[] = []): Promise<any> {
    const finalSql = interpolateSqlLocal(sql, bindings)

    // 1. 若處於 Worker 執行期且擁有原生 env.DB
    if (this.env?.DB) {
      return await this.env.DB.prepare(sql).bind(...bindings).run()
    }

    // 2. 若處於本機 CLI 執行期，直接透過 sqlite3 本機驅動極速執行
    const localFile = this.findLocalSqlitePath()
    if (!this.isRemote && localFile && fs.existsSync(localFile)) {
      try {
        execSync(`sqlite3 "${localFile}"`, {
          input: finalSql,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        })
        return
      } catch (err: any) {
        throw new Error(`[D1Driver SQLite Error] ${err.stderr || err.message}`)
      }
    }

    // 3. 遠端或 Fallback: 透過 Wrangler CLI 執行
    const tempFile = path.join(this.projectRoot, `server/temp_${Date.now()}_exec.sql`)
    fs.writeFileSync(tempFile, finalSql, 'utf-8')
    const targetFlag = this.isRemote ? '--remote' : '--local'
    try {
      execSync(`pnpm exec wrangler d1 execute DB ${targetFlag} --file="${tempFile}"`, {
        stdio: 'pipe',
        cwd: this.projectRoot
      })
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }
  }

  async query<T = any>(sql: string, bindings: any[] = []): Promise<T[]> {
    const finalSql = interpolateSqlLocal(sql, bindings)

    // 1. Worker 執行期
    if (this.env?.DB) {
      const { results } = await this.env.DB.prepare(sql).bind(...bindings).all()
      return (results as T[]) || []
    }

    // 2. 本地 CLI 高速讀取 (透過 stdin 避免跳脫引號問題)
    const localFile = this.findLocalSqlitePath()
    if (!this.isRemote && localFile && fs.existsSync(localFile)) {
      try {
        const out = execSync(`sqlite3 "${localFile}" -json`, {
          input: finalSql,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        })
        return out.trim() ? JSON.parse(out) : []
      } catch {}
    }

    // 3. Wrangler CLI 遠端或本地降級查詢
    const escapedSql = finalSql.replace(/"/g, '\\"')
    const targetFlag = this.isRemote ? '--remote' : '--local'
    try {
      const output = execSync(`pnpm exec wrangler d1 execute DB ${targetFlag} --json --command="${escapedSql}"`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe'
      })
      const parsed = JSON.parse(output)
      return (parsed[0]?.results as T[]) || []
    } catch {
      return []
    }
  }

  async executeRun(sql: string, bindings: any[] = []): Promise<ExecuteResult> {
    if (this.env?.DB) {
      const res = await this.env.DB.prepare(sql).bind(...bindings).run()
      return {
        changes: res.meta?.changes || 1,
        last_row_id: res.meta?.last_row_id || 0
      }
    }

    const localFile = this.findLocalSqlitePath()
    const finalSql = interpolateSqlLocal(sql, bindings)

    if (!this.isRemote && localFile && fs.existsSync(localFile)) {
      try {
        const fullSql = `${finalSql};\nSELECT changes() as changes, last_insert_rowid() as last_row_id;`
        const out = execSync(`sqlite3 "${localFile}" -json`, {
          input: fullSql,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        })
        const res = out.trim() ? JSON.parse(out) : []
        const meta = res[res.length - 1] || {}
        return {
          changes: meta.changes || 0,
          last_row_id: meta.last_row_id || 0
        }
      } catch (err: any) {
        throw new Error(`[D1Driver ExecuteRun Error] ${err.stderr || err.message}`)
      }
    }

    await this.executeRaw(finalSql)
    const lastIdRes = await this.query<{ id: number }>('SELECT last_insert_rowid() as id;')
    return {
      changes: 1,
      last_row_id: lastIdRes[0]?.id || 0
    }
  }

  async getTableColumns(tableName: string): Promise<string[]> {
    try {
      const rows = await this.query<{ name: string }>(`PRAGMA table_info(${tableName});`)
      if (rows && rows.length > 0) {
        return rows.map((r) => r.name)
      }
    } catch {}
    return []
  }

  async getAllTables(): Promise<string[]> {
    const rows = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'adonis_schema';"
    )
    return rows.map((r) => r.name)
  }

  async dropTable(tableName: string): Promise<void> {
    await this.executeRaw(`DROP TABLE IF EXISTS "${tableName}";`)
  }

  async initSchemaTable(migrationFiles: string[]): Promise<void> {
    const createTableSql = `
CREATE TABLE IF NOT EXISTS adonis_schema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  batch INTEGER,
  migration_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
`
    await this.executeRaw(createTableSql)

    const records = await this.getMigratedRecords()
    if (records.length === 0) {
      const tables = await this.getAllTables()
      const legacyFilesToSeed: string[] = []
      for (const file of migrationFiles) {
        const lower = file.toLowerCase()
        if (lower.includes('users') && tables.includes('users')) {
          legacyFilesToSeed.push(file)
        } else if (lower.includes('notes') && tables.includes('notes')) {
          legacyFilesToSeed.push(file)
        }
      }

      if (legacyFilesToSeed.length > 0) {
        console.log(`\x1b[33m💡 [D1 遷移] 偵測到現有資料表 (${tables.join(', ')})，自動對齊登記至 adonis_schema (Batch 1)...\x1b[0m`)
        for (const f of legacyFilesToSeed) {
          await this.executeRaw(`INSERT OR IGNORE INTO adonis_schema (name, batch) VALUES ('${f}', 1);`)
        }
      }
    }
  }

  async getMigratedRecords(): Promise<MigrationRecord[]> {
    return await this.query<MigrationRecord>('SELECT id, name, batch, migration_time FROM adonis_schema ORDER BY id ASC;')
  }

  async recordMigration(name: string, batch: number): Promise<void> {
    await this.executeRaw(`INSERT OR IGNORE INTO adonis_schema (name, batch) VALUES ('${name}', ${batch});`)
  }

  async rollbackMigration(name: string): Promise<void> {
    await this.executeRaw(`DELETE FROM adonis_schema WHERE name = '${name}';`)
  }

  async close(): Promise<void> {}
}

function escapeSqlValueLocal(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  if (v instanceof Date) return `'${v.toISOString()}'`
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

function interpolateSqlLocal(sql: string, bindings: any[] = []): string {
  let idx = 0
  return sql.replace(/\?/g, () => {
    if (idx < bindings.length) {
      return escapeSqlValueLocal(bindings[idx++])
    }
    return 'NULL'
  })
}
