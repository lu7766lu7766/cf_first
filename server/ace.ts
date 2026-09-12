#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { databaseConfig } from './config/database'
import { DriverFactory } from './core/drivers/driver_factory'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)
const command = args[0]
const targetName = args[1]
const isRemote = args.includes('--remote')

function printHelp() {
  const currentConn = (databaseConfig.default || 'd1').toUpperCase()
  console.log(`
\x1b[35m╭─────────────────────────────────────────────────────────────╮\x1b[0m
\x1b[35m│\x1b[0m  \x1b[1;36mAdonisJS 7 Ace CLI (Multi-Database Edition)\x1b[0m                \x1b[35m│\x1b[0m
\x1b[35m╰─────────────────────────────────────────────────────────────╯\x1b[0m

\x1b[33m當前生效連線 (DB_CONNECTION):\x1b[0m \x1b[1;32m${currentConn}\x1b[0m

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
  \x1b[1mmigration:run\x1b[0m            執行未套用的 Knex 資料庫遷移 (多資料庫支援，記錄至 adonis_schema)
  \x1b[1mmigration:rollback\x1b[0m       回滾上一批次 (Batch) 的資料庫遷移
  \x1b[1mmigration:status\x1b[0m         查看所有遷移檔案的套用狀態與批次
  \x1b[1mmigration:fresh\x1b[0m          重置資料庫並重新執行所有遷移 (可加 --seed [-f <name>])
  \x1b[1mdb:seed [-f <name>]\x1b[0m       執行資料庫種子腳本 (支援 -f/--files 指定檔案或全目錄執行，支援多資料庫)
  \x1b[1mdb:pull\x1b[0m                  從線上 Cloudflare D1 拉取最新資料並同步至本機 SQLite (D1 專用)
  \x1b[1mdb:path\x1b[0m                  查看本機 D1 SQLite 實體路徑與 tmp/db.sqlite 狀態 (D1 專用)
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

  const sqliteFiles: Array<{ path: string; mtime: number; score: number }> = []

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

/**
 * 確保在 tmp/db.sqlite 建立指向 Wrangler D1 本機 SQLite 的符號連結 (AdonisJS 雙向相容)
 */
function ensureDbSymlink(): { symlink: string; target: string } | null {
  const sqliteFile = findLocalSqlitePath()
  if (!sqliteFile) return null

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

/**
 * 解析命令列中的 -f 或 --file/--files 參數
 */
function parseFileFlag(argsList: string[]): string | null {
  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i]
    if (arg === '-f' || arg === '--file' || arg === '--files') {
      if (i + 1 < argsList.length && !argsList[i + 1].startsWith('-')) {
        return argsList[i + 1]
      }
    } else if (arg.startsWith('-f=')) {
      return arg.slice(3)
    } else if (arg.startsWith('--file=')) {
      return arg.slice(7)
    } else if (arg.startsWith('--files=')) {
      return arg.slice(8)
    }
  }
  return null
}

/**
 * 動態載入並執行 Seeder 檔案（支援多資料庫動態適配）
 */
async function runSeeders(specifiedFile: string | null = null): Promise<void> {
  const driver = DriverFactory.getDriver({ isRemote })
  const seedersDir = path.join(__dirname, 'database/seeders')
  if (!fs.existsSync(seedersDir)) {
    console.log('⚠️ 未找到 database/seeders 目錄。')
    return
  }

  const allFiles = fs
    .readdirSync(seedersDir)
    .filter((f) => f.endsWith('.ts') && !f.toLowerCase().startsWith('base_') && !f.endsWith('.d.ts'))

  if (allFiles.length === 0) {
    console.log('⚠️ database/seeders 目錄下沒有任何可執行的 Seeder 檔案。')
    return
  }

  let filesToRun: string[] = []
  if (specifiedFile) {
    const cleanTarget = path.basename(specifiedFile).replace(/\.ts$/, '').toLowerCase()

    const exactMatch = allFiles.find(
      (f) => f.replace(/\.ts$/, '').toLowerCase() === cleanTarget || f.toLowerCase() === specifiedFile.toLowerCase()
    )

    const fuzzyMatch = exactMatch || allFiles.find((f) => {
      const fBase = f.replace(/\.ts$/, '').toLowerCase()
      return fBase.includes(cleanTarget) || fBase.replace(/_seeder$/, '') === cleanTarget
    })

    if (!fuzzyMatch) {
      console.error(`\x1b[31m❌ 找不到指定的 Seeder 檔案: "${specifiedFile}"\x1b[0m`)
      console.log(`\x1b[33m💡 目前 database/seeders 目錄中可用的 Seeder 清單:\x1b[0m`)
      allFiles.forEach((f) => {
        const alias = f.replace(/_seeder\.ts$/, '').replace(/\.ts$/, '')
        console.log(`   - \x1b[1m${f}\x1b[0m (可使用: pnpm ace db:seed -f ${alias})`)
      })
      return
    }

    filesToRun = [fuzzyMatch]
  } else {
    filesToRun = [...allFiles].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )
  }

  const connDesc = driver.name === 'd1'
    ? (isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite')
    : `外部資料庫 [${driver.name.toUpperCase()}]`
  console.log(`🌱 載入種子檔案並執行 (${connDesc})...`)
  console.log(`📦 待執行 Seeder: ${filesToRun.join(', ')}\n`)

  const { Database } = await import('./core/database')
  Database.connection(driver.name)

  let successCount = 0
  for (const file of filesToRun) {
    const filePath = path.join(seedersDir, file)
    console.log(`   \x1b[36m▶ [SEEDING]\x1b[0m ${file}...`)
    const startTime = Date.now()

    try {
      const seederModule = await import(filePath)
      const SeederClass = seederModule.default

      if (typeof SeederClass !== 'function') {
        console.warn(`   \x1b[33m⚠️ ${file} 沒有 default export 類別，已略過。\x1b[0m`)
        continue
      }

      const seederInstance = new SeederClass()
      if (typeof seederInstance.run !== 'function') {
        console.warn(`   \x1b[33m⚠️ ${file} 的 default class 未實作 run() 方法，已略過。\x1b[0m`)
        continue
      }

      await seederInstance.run()
      const elapsed = Date.now() - startTime
      console.log(`   \x1b[32m✔ [COMPLETED]\x1b[0m ${file} (${elapsed}ms)\n`)
      successCount++
    } catch (err) {
      console.error(`   \x1b[31m❌ [FAILED]\x1b[0m 執行 ${file} 失敗:`, err)
      break
    }
  }

  if (successCount === filesToRun.length) {
    console.log(`\x1b[32m🎉 所有指定的資料庫種子資料已成功注入完成 (共 ${successCount} 個檔案)！\x1b[0m`)
  } else {
    console.log(`\x1b[33m⚠️ 部分種子腳本執行未全數成功 (${successCount}/${filesToRun.length})\x1b[0m`)
  }

  if (driver.name === 'd1' && !isRemote) {
    ensureDbSymlink()
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

      const content = `import { BaseSeeder } from './base_seeder'

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
      const driver = DriverFactory.getDriver({ isRemote })
      const connDesc = driver.name === 'd1'
        ? (isRemote ? '遠端 Cloudflare D1' : '本機 D1 SQLite')
        : `外部資料庫 [${driver.name.toUpperCase()}]`
      console.log(`🚀 開始執行 Knex 資料庫遷移 (${connDesc})...`)

      const dir = path.join(rootDir, 'database/migrations')
      if (!fs.existsSync(dir)) {
        console.log('⚠️ 未找到 migrations 目錄。')
        break
      }

      const allFiles = fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort()
      await driver.initSchemaTable(allFiles)

      const records = await driver.getMigratedRecords()
      const migratedNames = new Set(records.map((r) => r.name))
      const pendingFiles = allFiles.filter((f) => !migratedNames.has(f))

      if (pendingFiles.length === 0) {
        console.log('\x1b[32m✔ 所有遷移皆已套用完成，資料庫處於最新狀態 (Database is up to date)。\x1b[0m')
        if (driver.name === 'd1' && !isRemote) ensureDbSymlink()
        break
      }

      const maxBatch = records.length > 0 ? Math.max(...records.map((r) => r.batch)) : 0
      const currentBatch = maxBatch + 1

      console.log(`📦 本次執行批次 (Batch): ${currentBatch}，共計 ${pendingFiles.length} 個待執行檔案。`)

      let successCount = 0
      for (const file of pendingFiles) {
        const filePath = path.join(dir, file)
        console.log(`   \x1b[36m▶ [COMPILE & RUN]\x1b[0m ${file} -> [${driver.name.toUpperCase()}]`)
        try {
          const migrationModule = await import(filePath)
          const MigrationClass = migrationModule.default
          const migration = new MigrationClass()
          const sqls: string[] = await migration.compileUp(driver.knexClient)

          for (const sql of sqls) {
            await driver.executeRaw(sql)
          }

          await driver.recordMigration(file, currentBatch)
          successCount++
          console.log(`   \x1b[32m✔ [MIGRATED]\x1b[0m ${file}`)
        } catch (e) {
          console.error(`❌ 執行遷移失敗 (${file}):`, e)
          break
        }
      }

      console.log(`\x1b[32m✔ 成功處理 ${successCount} 個 Knex 遷移檔案。\x1b[0m`)
      if (driver.name === 'd1' && !isRemote) ensureDbSymlink()
      break
    }

    case 'migration:rollback': {
      const driver = DriverFactory.getDriver({ isRemote })
      console.log(`🔄 開始執行資料庫遷移回滾 [${driver.name.toUpperCase()}] (Rollback)...`)
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await driver.initSchemaTable(allFiles)

      const records = await driver.getMigratedRecords()
      const maxBatch = records.length > 0 ? Math.max(...records.map((r) => r.batch)) : 0

      if (!maxBatch || maxBatch <= 0) {
        console.log('\x1b[33m⚠️ 目前沒有可供回滾的遷移記錄。\x1b[0m')
        break
      }

      const batchRecords = records.filter((r) => r.batch === maxBatch).reverse()
      console.log(`⏪ 正在回滾批次 (Batch: ${maxBatch})，共計 ${batchRecords.length} 個檔案...`)

      let rollbackCount = 0
      for (const record of batchRecords) {
        const filePath = path.join(dir, record.name)
        console.log(`   \x1b[33m◀ [ROLLBACK]\x1b[0m ${record.name}`)
        try {
          if (fs.existsSync(filePath)) {
            const migrationModule = await import(filePath)
            const MigrationClass = migrationModule.default
            const migration = new MigrationClass()
            const sqls: string[] = await migration.compileDown(driver.knexClient)

            for (const sql of sqls) {
              await driver.executeRaw(sql)
            }
          }

          await driver.rollbackMigration(record.name)
          rollbackCount++
          console.log(`   \x1b[32m✔ [ROLLED BACK]\x1b[0m ${record.name}`)
        } catch (e) {
          console.error(`❌ 回滾失敗 (${record.name}):`, e)
          break
        }
      }

      console.log(`\x1b[32m✔ 成功回滾 ${rollbackCount} 個遷移檔案。\x1b[0m`)
      if (driver.name === 'd1' && !isRemote) ensureDbSymlink()
      break
    }

    case 'migration:status': {
      const driver = DriverFactory.getDriver({ isRemote })
      console.log(`📋 查詢資料庫遷移狀態 [${driver.name.toUpperCase()}] (Migration Status)...`)
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await driver.initSchemaTable(allFiles)

      const records = await driver.getMigratedRecords()
      const recordMap = new Map<string, any>()
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
      if (driver.name === 'd1' && !isRemote) ensureDbSymlink()
      break
    }

    case 'migration:fresh': {
      const driver = DriverFactory.getDriver({ isRemote })
      console.log(`\x1b[33m⚠️  正在重置資料庫 [${driver.name.toUpperCase()}] (Migration Fresh)... 全部表格將被清空！\x1b[0m`)
      const tables = await driver.getAllTables()
      if (tables.length > 0) {
        console.log(`🗑️ 清理現存表格: ${tables.join(', ')}`)
        for (const t of tables) {
          await driver.dropTable(t)
        }
      }
      await driver.dropTable('adonis_schema')

      console.log('🚀 開始從頭執行所有遷移檔案...')
      const dir = path.join(rootDir, 'database/migrations')
      const allFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts')).sort() : []
      await driver.initSchemaTable(allFiles)

      for (const file of allFiles) {
        const filePath = path.join(dir, file)
        console.log(`   \x1b[36m▶ [COMPILE & RUN]\x1b[0m ${file}`)
        const migrationModule = await import(filePath)
        const MigrationClass = migrationModule.default
        const migration = new MigrationClass()
        const sqls: string[] = await migration.compileUp(driver.knexClient)
        for (const sql of sqls) {
          await driver.executeRaw(sql)
        }
        await driver.recordMigration(file, 1)
        console.log(`   \x1b[32m✔ [MIGRATED]\x1b[0m ${file}`)
      }

      console.log('\x1b[32m✔ 所有遷移重新建構完成！\x1b[0m')
      if (driver.name === 'd1' && !isRemote) ensureDbSymlink()

      if (args.includes('--seed')) {
        console.log('\n🌱 自動執行種子腳本 (--seed)...')
        const specifiedFile = parseFileFlag(args)
        await runSeeders(specifiedFile)
      }
      break
    }

    case 'db:path': {
      const driver = DriverFactory.getDriver({ isRemote })
      if (driver.name !== 'd1') {
        console.log(`\n\x1b[33m⚠️ 指令 db:path 為 Cloudflare D1 專屬維護工具。\n目前生效的資料庫連線為: [${driver.name.toUpperCase()}]。\x1b[0m\n`)
        break
      }

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
      const specifiedFile = parseFileFlag(args)
      await runSeeders(specifiedFile)
      break
    }

    case 'db:pull': {
      const driver = DriverFactory.getDriver({ isRemote })
      if (driver.name !== 'd1') {
        console.log(`\n\x1b[33m⚠️ 指令 db:pull 為從 Cloudflare 線上 D1 拉取資料的專屬工具。\n目前生效的資料庫連線為: [${driver.name.toUpperCase()}]。\x1b[0m\n`)
        break
      }

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

async function main() {
  try {
    await run()
  } finally {
    await DriverFactory.closeAll()
  }
}

main()
