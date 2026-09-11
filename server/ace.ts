#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
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
  \x1b[1mmake:migration <Name>\x1b[0m    建立新的 SQL 資料庫遷移檔案
  \x1b[1mmake:seeder <Name>\x1b[0m       建立新的 Seeder 種子資料腳本
  \x1b[1mmigration:run\x1b[0m            執行資料庫遷移
  \x1b[1mdb:seed\x1b[0m                  執行資料庫種子腳本
`)
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
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
      const timestamp = Math.floor(Date.now() / 1000)
      const fileName = `${timestamp}_${targetName.toLowerCase()}.sql`
      const dir = path.join(rootDir, 'database/migrations')
      ensureDir(dir)
      const filePath = path.join(dir, fileName)

      const content = `-- Migration: ${targetName}
CREATE TABLE IF NOT EXISTS ${targetName.replace(/^create_|_table$/g, '')} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
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
      console.log('🚀 開始執行資料庫遷移 (Migrations)...')
      const dir = path.join(rootDir, 'database/migrations')
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.sql'))
        for (const file of files) {
          console.log(`   \x1b[36m▶ [EXECUTE]\x1b[0m ${file}`)
        }
        console.log(`\x1b[32m✔ 成功處理 ${files.length} 個遷移檔案。\x1b[0m`)
        console.log('\x1b[33m💡 提示: 若要將遷移直接套用於 Cloudflare 遠端 D1，可執行:\x1b[0m')
        console.log('   pnpm exec wrangler d1 execute <db-name> --file=server/database/migrations/<file>.sql')
      }
      break
    }

    case 'db:seed': {
      console.log('🌱 載入種子檔案並執行...')
      try {
        const seederModule = await import('./database/seeders/main_seeder')
        const SeederClass = seederModule.default
        const seeder = new SeederClass()
        await seeder.run()
      } catch (e) {
        console.error('❌ 種子執行失敗:', e)
      }
      break
    }

    default:
      console.error(`未知指令: ${command}`)
      printHelp()
  }
}

run()
