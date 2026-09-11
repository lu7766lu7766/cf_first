import { Env } from '../core/env'

export const env = Env.create({
  // 1. 應用程式基礎設定
  APP_KEY: Env.schema.string({ default: 'cf-first-super-secret-adonis-app-key-32chars' }),
  APP_TIMEZONE: Env.schema.string({ default: 'Asia/Taipei' }),
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const, { default: 'development' }),
  PORT: Env.schema.number({ default: 8787 }).optional(),

  // 2. 資料庫連線配置 (支援 d1, sqlite, postgres, mysql)
  DB_CONNECTION: Env.schema.enum(['d1', 'sqlite', 'postgres', 'mysql'] as const, { default: 'd1' }),
  D1_BINDING: Env.schema.string({ default: 'DB' }).optional(),
  DB_HOST: Env.schema.string({ default: '127.0.0.1' }).optional(),
  DB_PORT: Env.schema.number({ default: 3306 }).optional(),
  DB_USER: Env.schema.string({ default: 'root' }).optional(),
  DB_PASSWORD: Env.schema.string({ default: '' }).optional(),
  DB_DATABASE: Env.schema.string({ default: 'cf_first' }).optional(),
  DATABASE_URL: Env.schema.string().optional(),

  // 3. 安全與身分驗證
  JWT_SECRET: Env.schema.string().optional()
})
