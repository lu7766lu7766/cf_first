#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)
const command = args[0]
const targetName = args[1]

function printHelp() {
  console.log(`
\x1b[35m╭─────────────────────────────────────────────────────────────╮\x1b[0m
\x1b[35m│\x1b[0m  \x1b[1;36mAdonisJS 7 Ace CLI (Cloudflare Edge Edition)\x1b[0m               \x1b[35m│\x1b[0m
\x1b[35m╰─────────────────────────────────────────────────────────────╯\x1b[0m

\x1b[33m使用方式:\x1b[0m
  pnpm ace <指令> [參數]

\x1b[32m可用指令 (Available Commands):\x1b[0m
  \x1b[1mmake:controller <Name>\x1b[0m   建立新的 Controller 類別
  \x1b[1mmake:model <Name>\x1b[0m        建立新的 Active Record Model 類別
  \x1b[1mmake:middleware <Name>\x1b[0m   建立新的 Middleware 中介層
  \x1b[1mmake:validator <Name>\x1b[0m    建立新的 VineJS Class Validator
  \x1b[1mmake:migration <Name>\x1b[0m    建立新的 Knex TypeScript 遷移類別檔案
  \x1b[1mmake:seeder <Name>\x1b[0m       建立新的 Seeder 種子資料腳本
  \x1b[1mgenerate:key\x1b[0m             產出安全隨機 APP_KEY (寫入 .env/.dev.vars，支援 --show, --jwt)
  \x1b[1mgenerate:jwt-secret\x1b[0m      產出安全隨機 JWT_SECRET (寫入 .env/.dev.vars，支援 --show)
  \x1b[1mgenerate:secrets\x1b[0m         一次產出 APP_KEY 與 JWT_SECRET 並同步寫入環境檔
  \x1b[1mmigration:run\x1b[0m            執行未套用的 Knex 資料庫遷移 (記錄至 adonis_schema)
  \x1b[1mmigration:rollback\x1b[0m       回滾上一批次 (Batch) 的資料庫遷移
  \x1b[1mmigration:status\x1b[0m         查看所有遷移檔案的套用狀態與批次
  \x1b[1mmigration:fresh\x1b[0m          重置資料庫並重新執行所有遷移 (可加 --seed)
  \x1b[1mdb:seed\x1b[0m                  執行資料庫種子腳本 (可加 --remote)
  \x1b[1mdb:pull\x1b[0m                  從線上 Cloudflare D1 拉取最新資料並同步至本機 SQLite
  \x1b[1mdb:path\x1b[0m                  查看本機 D1 SQLite 實體路徑與 tmp/db.sqlite 狀態
`)
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 產出指定字節長度的密碼學安全隨機金鑰 (Base64 編碼，相容 AdonisJS 6 標準)
 */
function generateSecureKey(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64')
}

/**
 * 更新或建立指定環境變數於 .env 與 .dev.vars (相容 Cloudflare Workers 本機環境)
 */
function updateEnvKey(
  key: string,
  value: string,
  projectRoot: string
): { updated: string[]; created: string[] } {
  const envFiles = ['.env', '.dev.vars']
  const updated: string[] = []
  const created: string[] = []

  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file)
    let content = ''
    const exists = fs.existsSync(filePath)

    if (exists) {
      content = fs.readFileSync(filePath, 'utf-8')
    } else {
      const examplePath = path.join(projectRoot, '.env.example')
      if (fs.existsSync(examplePath)) {
        content = fs.readFileSync(examplePath, 'utf-8')
      }
    }

    const pattern = new RegExp(`^${key}=.*$`, 'm')
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`)
    } else {
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n'
      }
      content += `${key}=${value}\n`
    }

    fs.writeFileSync(filePath, content, 'utf-8')
    if (exists) {
      updated.push(file)
    } else {
      created.push(file)
    }
  }

  return { updated, created }
}

/**
 * 搜尋 Wrangler 本機 D1 SQLite 實體檔案路徑
 */
function findLocalSqlitePath(): string | null {
  const d1Dir = path.join(__dirname, '../.wrangler/state/v3/d1')
  if (!fs.existsSync(d1Dir)) return null

  const sqliteFiles: Array<{ path: string; mtime: number }> = []

  function scan(dir: string): void {
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
          sqliteFiles.push({ path: fullPath, mtime: stats.mtimeMs })
        }
      }
    } catch {}
  }

  scan(d1Dir)
  if (sqliteFiles.length === 0) return null
  sqliteFiles.sort((a, b) => b.mtime - a.mtime)
  return sqliteFiles[0].path
}

/**
 * 確保在 tmp/db.sqlite 建立指向 Wrangler D1 本機 SQLite 的符號連結 (AdonisJS 雙向相容)
 */
function ensureDbSymlink(): { symlink: string; target: string } | null {
  const sqliteFile = findLocalSqlitePath()
  if (!sqliteFile) return null

  // 強制執行 WAL Checkpoint，將所有暫存寫入主資料庫，防止第三方 GUI 工具讀取失敗
  try {
    execSync(`sqlite3 "${sqliteFile}" "PRAGMA wal_checkpoint(TRUNCATE);"`, { stdio: 'pipe' })
  } catch {}

  const tmpDir = path.join(__dirname, '../tmp')
  ensureDir(tmpDir)

  const pairs = [
    { target: sqliteFile, link: path.join(tmpDir, 'db.sqlite') },
    { target: `${sqliteFile}-shm`, link: path.join(tmpDir, 'db.sqlite-shm') },
    { target: `${sqliteFile}-wal`, link: path.join(tmpDir, 'db.sqlite-wal') }
  ]

  for (const pair of pairs) {
    try {
      if (fs.existsSync(pair.link) || fs.lstatSync(pair.link).isSymbolicLink?.()) {
        fs.unlinkSync(pair.link)
      }
    } catch {}

    if (fs.existsSync(pair.target)) {
      try {
        fs.symlinkSync(pair.target, pair.link)
      } catch {}
    }
  }

  return { symlink: path.join(tmpDir, 'db.sqlite'), target: sqliteFile }
}

const isRemote = args.includes('--remote')

/**
 * 透過 Wrangler D1 執行 SQL 指令（使用暫存檔防止引號跳脫問題，支援 --remote）
 */
function runD1Sql(sql: string): void {
  const projectRoot = path.join(__dirname, '..')
  const tempFile = path.join(__dirname, `temp_${Date.now()}_exec.sql`)
  fs.writeFileSync(tempFile, sql, 'utf-8')
  const targetFlag = isRemote ? '--remote' : '--local'
  try {
    execSync(`pnpm exec wrangler d1 execute DB ${targetFlag} --file="${tempFile}"`, {
      stdio: 'pipe',
      cwd: projectRoot
    })
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
  }
}

/**
 * 透過 Wrangler D1 執行查詢並以 JSON 解析回傳（支援 --remote）
 */
function queryD1Json<T = any>(sql: string): T[] {
  const projectRoot = path.join(__dirname, '..')
  const escapedSql = sql.replace(/"/g, '\\"')
  const targetFlag = isRemote ? '--remote' : '--local'
  try {
    const output = execSync(`pnpm exec wrangler d1 execute DB ${targetFlag} --json --command="${escapedSql}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe'
    })
    const parsed = JSON.parse(output)
    return (parsed[0]?.results as T[]) || []
  } catch {
    return []
  }
}

interface SchemaRecord {
  id: number
  name: string
  batch: number
  migration_time: string
}

/**
 * 初始化 AdonisJS 標準 adonis_schema 歷史紀錄表，並自動相容既有表格
 */
async function initSchemaTable(migrationFiles: string[]) {
  // 1. 建立 adonis_schema 資料表（若不存在）
  const createTableSql = `
CREATE TABLE IF NOT EXISTS adonis_schema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  batch INTEGER,
  migration_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
`
  runD1Sql(createTableSql)

  // 2. 檢查目前已記錄之遷移
  const records = queryD1Json<SchemaRecord>('SELECT name, batch FROM adonis_schema;')
  const migratedSet = new Set(records.map((r) => r.name))

  // 3. 過渡期相容：若 adonis_schema 為空，但資料庫中已有既有表格 (users / notes)，自動登錄為 Batch 1
  if (records.length === 0) {
    const tables = queryD1Json<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'adonis_schema';"
    )
    const tableNames = tables.map((t) => t.name)

    const legacyFilesToSeed: string[] = []
    for (const file of migrationFiles) {
      const lower = file.toLowerCase()
      if (lower.includes('users') && tableNames.includes('users')) {
        legacyFilesToSeed.push(file)
      } else if (lower.includes('notes') && tableNames.includes('notes')) {
        legacyFilesToSeed.push(file)
      }
    }

    if (legacyFilesToSeed.length > 0) {
      console.log(`\x1b[33m💡 [遷移系統] 偵測到現有資料表 (${tableNames.join(', ')})，自動對齊登記至 adonis_schema (Batch 1)...\x1b[0m`)
      const seedSql = legacyFilesToSeed
        .map((f) => `INSERT OR IGNORE INTO adonis_schema (name, batch) VALUES ('${f}', 1);`)
        .join('\n')
      runD1Sql(seedSql)
    }
  }
}

async function run() {
  if (!command || command === '--help' || command === '-h' || command === 'list') {
    printHelp()
    return
  }

  const rootDir = __dirname

  switch (command) {
    case 'make:controller': {
      if (!targetName) {
        console.error('❌ 請提供 Controller 名稱，例如: pnpm ace make:controller Users')
        return
      }
      const rawName = targetName.replace(/Controller$/i, '')
      const className = `${rawName}Controller`
      const fileName = `${rawName.toLowerCase()}_controller.ts`
      const dir = path.join(rootDir, 'app/controllers')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `import { BaseController } from '../../core/controller'
import type { HttpContext } from '../../core/types'

export default class ${className} extends BaseController {
  async index(ctx: HttpContext) {
    return ctx.response.json({ message: 'Hello from ${className}.index' })
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.all()
    return ctx.response.status(201).json({ message: 'Created', payload })
  }

  async show(ctx: HttpContext) {
    const id = ctx.params.id
    return ctx.response.json({ message: \`Showing record \${id}\` })
  }
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/app/controllers/${fileName}`)
      break
    }

    case 'make:model': {
      if (!targetName) {
        console.error('❌ 請提供 Model 名稱，例如: pnpm ace make:model Product')
        return
      }
      const className = targetName.charAt(0).toUpperCase() + targetName.slice(1)
      const fileName = `${targetName.toLowerCase()}.ts`
      const tableName = `${targetName.toLowerCase()}s`
      const dir = path.join(rootDir, 'app/models')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `import { BaseModel } from '../../core/model'

export class ${className} extends BaseModel {
  static table = '${tableName}'
  static primaryKey = 'id'

  declare id: number
  declare created_at: string
  declare updated_at: string
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/app/models/${fileName}`)
      break
    }

    case 'make:validator': {
      if (!targetName) {
        console.error('❌ 請提供 Validator 名稱，例如: pnpm ace make:validator Product')
        return
      }
      const rawName = targetName.replace(/Validator$/i, '')
      const className = `Create${rawName}Validator`
      const fileName = `${rawName.toLowerCase()}_validator.ts`
      const dir = path.join(rootDir, 'app/validators')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `import { BaseValidator, field, vine } from '../../core/validator'

export class ${className} extends BaseValidator {
  @field(vine.string().minLength(3))
  name!: string

  @field(vine.number().positive())
  price!: number
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/app/validators/${fileName}`)
      break
    }

    case 'make:middleware': {
      if (!targetName) {
        console.error('❌ 請提供 Middleware 名稱，例如: pnpm ace make:middleware Log')
        return
      }
      const fileName = `${targetName.toLowerCase()}_middleware.ts`
      const dir = path.join(rootDir, 'app/middleware')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `import type { MiddlewareHandler } from '../../core/types'

export const ${targetName.toLowerCase()}Middleware: MiddlewareHandler = async (ctx, next) => {
  console.log(\`[Middleware] \${ctx.request.method} \${ctx.request.url}\`)
  await next()
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/app/middleware/${fileName}`)
      break
    }

    case 'make:migration': {
      if (!targetName) {
        console.error('❌ 請提供 Migration 名稱，例如: pnpm ace make:migration create_products_table')
        return
      }
      const timestamp = Date.now()
      const cleanName = targetName.toLowerCase()
      const fileName = `${timestamp}_${cleanName}.ts`
      const dir = path.join(rootDir, 'database/migrations')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)
      const tableName = cleanName.replace(/^create_|_table$/g, '')

      const content = `import { BaseSchema } from '../../core/schema'

export default class extends BaseSchema {
  protected tableName = '${tableName}'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.timestamp('created_at').defaultTo(this.now())
      table.timestamp('updated_at').defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/database/migrations/${fileName}`)
      break
    }

    case 'make:seeder': {
      if (!targetName) {
        console.error('❌ 請提供 Seeder 名稱，例如: pnpm ace make:seeder User')
        return
      }
      const rawName = targetName.replace(/Seeder$/i, '')
      const className = `${rawName}Seeder`
      const fileName = `${rawName.toLowerCase()}_seeder.ts`
      const dir = path.join(rootDir, 'database/seeders')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `import { BaseSeeder } from './main_seeder'

export default class ${className} extends BaseSeeder {
  async run(): Promise<void> {
    console.log('🌱 執行 ${className}...')
  }
}
`
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`\x1b[32m✔ [CREATE]\x1b[0m server/database/seeders/${fileName}`)
      break
    }

    case 'migration:run': {
      console.log(`🚀 開始執行 Knex TypeScript 資料庫遷移 (${isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite'})...`)
      const dir = path.join(rootDir, 'database/migrations')
      if (!fs.existsSync(dir)) {
        console.log('⚠️ 未找到 migrations 目錄。')
        break
      }

      const allFiles = fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort()
      await initSchemaTable(allFiles)

      // 取得已套用之遷移清單
      const records = queryD1Json<SchemaRecord>('SELECT name, batch FROM adonis_schema;')
      const migratedNames = new Set(records.map((r) => r.name))
      const pendingFiles = allFiles.filter((f) => !migratedNames.has(f))

      if (pendingFiles.length === 0) {
        console.log('\x1b[32m✔ 所有遷移皆已套用完成，資料庫處於最新狀態 (Database is up to date)。\x1b[0m')
        if (!isRemote) ensureDbSymlink()
        break
      }

      // 計算新 Batch 編號
      const maxBatchResult = queryD1Json<{ max_batch: number | null }>('SELECT MAX(batch) as max_batch FROM adonis_schema;')
      const currentBatch = ((maxBatchResult[0]?.max_batch) || 0) + 1

      console.log(`📦 本次執行批次 (Batch): ${currentBatch}，共計 ${pendingFiles.length} 個待執行檔案。`)

      let successCount = 0
      for (const file of pendingFiles) {
        const filePath = path.join(dir, file)
        console.log(`   \x1b[36m▶ [COMPILE & RUN]\x1b[0m ${file} -> ${isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite'}`)
        try {
          const migrationModule = await import(filePath)
          const MigrationClass = migrationModule.default
          const migration = new MigrationClass()
          const sqls: string[] = await migration.compileUp()

          // 執行遷移 DDL
          if (sqls.length > 0) {
            runD1Sql(sqls.join(';\n') + ';')
          }

          // 寫入 adonis_schema
          runD1Sql(`INSERT INTO adonis_schema (name, batch) VALUES ('${file}', ${currentBatch});`)
          successCount++
          console.log(`   \x1b[32m✔ [MIGRATED]\x1b[0m ${file}`)
        } catch (e) {
          console.error(`❌ 執行遷移失敗 (${file}):`, e)
          break
        }
      }

      console.log(`\x1b[32m✔ 成功處理 ${successCount} 個 Knex 遷移檔案。\x1b[0m`)
      ensureDbSymlink()
      break
    }

    case 'migration:rollback': {
      console.log('🔄 開始執行資料庫遷移回滾 (Rollback)...')
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await initSchemaTable(allFiles)

      const maxBatchResult = queryD1Json<{ max_batch: number | null }>('SELECT MAX(batch) as max_batch FROM adonis_schema;')
      const maxBatch = maxBatchResult[0]?.max_batch

      if (!maxBatch || maxBatch <= 0) {
        console.log('\x1b[33m⚠️ 目前沒有可供回滾的遷移記錄。\x1b[0m')
        break
      }

      const records = queryD1Json<SchemaRecord>(`SELECT name, batch FROM adonis_schema WHERE batch = ${maxBatch} ORDER BY id DESC;`)
      console.log(`⏪ 正在回滾批次 (Batch: ${maxBatch})，共計 ${records.length} 個檔案...`)

      let rollbackCount = 0
      for (const record of records) {
        const filePath = path.join(dir, record.name)
        console.log(`   \x1b[33m◀ [ROLLBACK]\x1b[0m ${record.name}`)
        try {
          if (fs.existsSync(filePath)) {
            const migrationModule = await import(filePath)
            const MigrationClass = migrationModule.default
            const migration = new MigrationClass()
            const sqls: string[] = await migration.compileDown()

            if (sqls.length > 0) {
              runD1Sql(sqls.join(';\n') + ';')
            }
          }

          runD1Sql(`DELETE FROM adonis_schema WHERE name = '${record.name}';`)
          rollbackCount++
          console.log(`   \x1b[32m✔ [ROLLED BACK]\x1b[0m ${record.name}`)
        } catch (e) {
          console.error(`❌ 回滾失敗 (${record.name}):`, e)
          break
        }
      }

      console.log(`\x1b[32m✔ 成功回滾 ${rollbackCount} 個遷移檔案。\x1b[0m`)
      ensureDbSymlink()
      break
    }

    case 'migration:status': {
      console.log('📋 查詢資料庫遷移狀態 (Migration Status)...')
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await initSchemaTable(allFiles)

      const records = queryD1Json<SchemaRecord>('SELECT name, batch, migration_time FROM adonis_schema ORDER BY id ASC;')
      const recordMap = new Map<string, SchemaRecord>()
      for (const r of records) recordMap.set(r.name, r)

      console.log('\n\x1b[36m┌────────────────────────────────────────────────────────┬──────────┬───────┬─────────────────────┐\x1b[0m')
      console.log('\x1b[36m│ 遷移檔案名稱 (Migration Name)                          │ 狀態     │ Batch │ 遷移時間 (Time)     │\x1b[0m')
      console.log('\x1b[36m├────────────────────────────────────────────────────────┼──────────┼───────┼─────────────────────┤\x1b[0m')

      for (const file of allFiles) {
        const record = recordMap.get(file)
        const paddedFile = file.padEnd(54, ' ')
        if (record) {
          const status = '\x1b[32mMigrated\x1b[0m'
          const batchStr = String(record.batch).padEnd(5, ' ')
          const timeStr = String(record.migration_time || '').slice(0, 19).padEnd(19, ' ')
          console.log(`│ ${paddedFile} │ ${status} │ ${batchStr} │ ${timeStr} │`)
        } else {
          const status = '\x1b[33mPending \x1b[0m'
          console.log(`│ ${paddedFile} │ ${status} │   -   │          -          │`)
        }
      }
      console.log('\x1b[36m└────────────────────────────────────────────────────────┴──────────┴───────┴─────────────────────┘\x1b[0m\n')
      ensureDbSymlink()
      break
    }

    case 'migration:fresh': {
      console.log('\x1b[33m⚠️  正在重置本機 D1 資料庫 (Migration Fresh)... 全部表格將被清空！\x1b[0m')
      const tables = queryD1Json<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
      )
      const tableNames = tables.map((t) => t.name)
      if (tableNames.length > 0) {
        console.log(`🗑️ 清理現存表格: ${tableNames.join(', ')}`)
        const dropSql = tableNames.map((t) => `DROP TABLE IF EXISTS "${t}";`).join('\n')
        runD1Sql(dropSql)
      }

      console.log('🚀 開始從頭執行所有遷移檔案...')
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await initSchemaTable(allFiles)

      for (const file of allFiles) {
        const filePath = path.join(dir, file)
        console.log(`   \x1b[36m▶ [COMPILE & RUN]\x1b[0m ${file}`)
        const migrationModule = await import(filePath)
        const MigrationClass = migrationModule.default
        const migration = new MigrationClass()
        const sqls: string[] = await migration.compileUp()
        if (sqls.length > 0) {
          runD1Sql(sqls.join(';\n') + ';')
        }
        runD1Sql(`INSERT INTO adonis_schema (name, batch) VALUES ('${file}', 1);`)
        console.log(`   \x1b[32m✔ [MIGRATED]\x1b[0m ${file}`)
      }

      console.log('\x1b[32m✔ 所有遷移重新建構完成！\x1b[0m')
      ensureDbSymlink()

      if (args.includes('--seed')) {
        console.log('\n🌱 自動執行種子腳本 (--seed)...')
        const { Hash } = await import('./core/hash')
        const hashedRoot = await Hash.make('root')
        const seedSql = `INSERT OR REPLACE INTO users (id, username, email, password, full_name, created_at, updated_at) VALUES (1, 'root', 'root@example.com', '${hashedRoot}', '系統管理員 Root', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`
        runD1Sql(seedSql)

        const seederModule = await import('./database/seeders/main_seeder')
        const SeederClass = seederModule.default
        const seeder = new SeederClass()
        await seeder.run()
        console.log('\x1b[32m✔ 種子資料注入完成！\x1b[0m')
      }
      break
    }

    case 'db:path': {
      console.log('\n\x1b[35m╭─────────────────────────────────────────────────────────────╮\x1b[0m')
      console.log('\x1b[35m│\x1b[0m  \x1b[1;36mCloudflare D1 SQLite 實體位置與 AdonisJS 捷徑\x1b[0m              \x1b[35m│\x1b[0m')
      console.log('\x1b[35m╰─────────────────────────────────────────────────────────────╯\x1b[0m\n')

      const info = ensureDbSymlink()
      if (info) {
        const stats = fs.statSync(info.target)
        const sizeKb = (stats.size / 1024).toFixed(2)
        console.log(`📁 \x1b[1mCloudflare D1 實體檔案:\x1b[0m`)
        console.log(`   \x1b[36m${info.target}\x1b[0m (${sizeKb} KB)`)
        console.log(`\n🔗 \x1b[1mAdonisJS 相容捷徑 (Symlink):\x1b[0m`)
        console.log(`   \x1b[32m${info.symlink}\x1b[0m`)
        console.log(`\n💡 \x1b[33m使用提示:\x1b[0m`)
        console.log(`   您可使用任何 SQLite 工具 (如 VS Code SQLite Viewer / DBeaver / sqlite3 CLI)`)
        console.log(`   直接開啟 \x1b[1mtmp/db.sqlite\x1b[0m 進行本機資料庫檢視與除錯！\n`)
      } else {
        console.log('\x1b[33m⚠️ 尚未偵測到本機 D1 SQLite 檔案，請先執行 pnpm ace migration:run 或啟動 wrangler。\x1b[0m\n')
      }
      break
    }

    case 'db:seed': {
      console.log(`🌱 載入種子檔案並執行 (${isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite'})...`)
      try {
        const { Hash } = await import('./core/hash')
        const hashedRoot = await Hash.make('root')
        const seedSql = `
INSERT OR REPLACE INTO users (id, username, email, password, full_name, created_at, updated_at) 
VALUES (1, 'root', 'root@example.com', '${hashedRoot}', '系統管理員 Root', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO notes (id, title, content, created_at, updated_at) 
VALUES (1, '【種子筆記 1】探索 AdonisJS 7 開發體驗', '採用 Class Controller、Active Record 與 VineJS 驗證', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`
        console.log(`   \x1b[36m▶ [SEED]\x1b[0m 寫入初始種子資料至 ${isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite'}...`)
        runD1Sql(seedSql)

        console.log('\x1b[32m✔ 種子資料注入完成！\x1b[0m')
        if (!isRemote) ensureDbSymlink()
      } catch (e) {
        console.error('❌ 種子執行失敗:', e)
      }
      break
    }

    case 'db:pull': {
      console.log('📥 正在從 Cloudflare 線上 D1 (cf_first) 下載最新資料庫並同步至地端...')
      const projectRoot = path.join(rootDir, '..')
      const tmpDir = path.join(projectRoot, 'tmp')
      ensureDir(tmpDir)
      const exportFile = path.join(tmpDir, 'remote_backup.sql')

      try {
        console.log('   \x1b[36m▶ [EXPORT]\x1b[0m 匯出線上 D1 資料庫至 tmp/remote_backup.sql...')
        execSync(`pnpm exec wrangler d1 export cf_first --remote --output="${exportFile}"`, {
          cwd: projectRoot,
          stdio: 'pipe'
        })

        console.log('   \x1b[36m▶ [CLEAN]\x1b[0m 重置本機舊資料表...')
        const localFile = findLocalSqlitePath()
        if (localFile && fs.existsSync(localFile)) {
          try {
            const shm = `${localFile}-shm`
            const wal = `${localFile}-wal`
            fs.unlinkSync(localFile)
            if (fs.existsSync(shm)) fs.unlinkSync(shm)
            if (fs.existsSync(wal)) fs.unlinkSync(wal)
          } catch {}
        }

        console.log('   \x1b[36m▶ [IMPORT]\x1b[0m 匯入資料至本機 SQLite...')
        execSync(`pnpm exec wrangler d1 execute DB --local --file="${exportFile}"`, {
          cwd: projectRoot,
          stdio: 'pipe'
        })

        ensureDbSymlink()
        console.log('\x1b[32m✔ 線上資料庫已成功同步至本地 SQLite (tmp/db.sqlite)！\x1b[0m')
      } catch (err) {
        console.error('❌ 同步失敗:', err)
      }
      break
    }

    case 'generate:key':
    case 'key:generate':
    case 'make:key': {
      const isShow = args.includes('--show')
      const includeJwt = args.includes('--jwt')
      const projectRoot = path.join(rootDir, '..')

      const appKey = generateSecureKey(32)
      console.log(`\n\x1b[32m✔ [GENERATE]\x1b[0m 成功產出安全應用程式金鑰 (APP_KEY)`)
      console.log(`🔑 \x1b[1;36mAPP_KEY:\x1b[0m ${appKey}`)

      let jwtSecret: string | null = null
      if (includeJwt) {
        jwtSecret = generateSecureKey(32)
        console.log(`\n\x1b[32m✔ [GENERATE]\x1b[0m 成功產出安全 JWT 金鑰 (--jwt)`)
        console.log(`🛡️  \x1b[1;35mJWT_SECRET:\x1b[0m ${jwtSecret}`)
      }

      if (isShow) {
        console.log(`\n\x1b[33m💡 [提示]\x1b[0m 已指定 --show 參數，僅在終端機顯示，未寫入環境變數檔案。\n`)
      } else {
        const keyResult = updateEnvKey('APP_KEY', appKey, projectRoot)
        if (jwtSecret) {
          updateEnvKey('JWT_SECRET', jwtSecret, projectRoot)
        }
        const affectedFiles = Array.from(new Set([...keyResult.updated, ...keyResult.created]))
        console.log(`\n📝 \x1b[32m✔ 已同步寫入環境變數設定檔:\x1b[0m`)
        affectedFiles.forEach((f) => console.log(`   - ${f}`))
        console.log(`\n💡 Cloudflare Workers (.dev.vars) 與 Node.js (.env) 已同步生效！\n`)
      }
      break
    }

    case 'generate:jwt-secret':
    case 'jwt:generate':
    case 'jwt:secret':
    case 'make:jwt-secret': {
      const isShow = args.includes('--show')
      const projectRoot = path.join(rootDir, '..')

      const jwtSecret = generateSecureKey(32)
      console.log(`\n\x1b[32m✔ [GENERATE]\x1b[0m 成功產出安全 JWT 金鑰 (JWT_SECRET)`)
      console.log(`🛡️  \x1b[1;35mJWT_SECRET:\x1b[0m ${jwtSecret}`)

      if (isShow) {
        console.log(`\n\x1b[33m💡 [提示]\x1b[0m 已指定 --show 參數，僅在終端機顯示，未寫入環境變數檔案。\n`)
      } else {
        const result = updateEnvKey('JWT_SECRET', jwtSecret, projectRoot)
        const affectedFiles = Array.from(new Set([...result.updated, ...result.created]))
        console.log(`\n📝 \x1b[32m✔ 已同步寫入環境變數設定檔:\x1b[0m`)
        affectedFiles.forEach((f) => console.log(`   - ${f}`))
        console.log(`\n💡 Cloudflare Workers (.dev.vars) 與 Node.js (.env) 已同步生效！\n`)
      }
      break
    }

    case 'generate:secrets': {
      const isShow = args.includes('--show')
      const projectRoot = path.join(rootDir, '..')

      const appKey = generateSecureKey(32)
      const jwtSecret = generateSecureKey(32)

      console.log(`\n\x1b[32m✔ [GENERATE]\x1b[0m 成功產出全域安全金鑰 (APP_KEY & JWT_SECRET)`)
      console.log(`🔑 \x1b[1;36mAPP_KEY:\x1b[0m    ${appKey}`)
      console.log(`🛡️  \x1b[1;35mJWT_SECRET:\x1b[0m ${jwtSecret}`)

      if (isShow) {
        console.log(`\n\x1b[33m💡 [提示]\x1b[0m 已指定 --show 參數，僅在終端機顯示，未寫入環境變數檔案。\n`)
      } else {
        updateEnvKey('APP_KEY', appKey, projectRoot)
        updateEnvKey('JWT_SECRET', jwtSecret, projectRoot)
        console.log(`\n📝 \x1b[32m✔ 已同步寫入環境變數設定檔:\x1b[0m`)
        console.log(`   - .env`)
        console.log(`   - .dev.vars`)
        console.log(`\n💡 Cloudflare Workers (.dev.vars) 與 Node.js (.env) 已同步生效！\n`)
      }
      break
    }

    default:
      console.error(`未知指令: ${command}`)
      printHelp()
  }
}

run()
