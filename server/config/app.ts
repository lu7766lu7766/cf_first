import { env } from '../start/env'

export interface AppConfig {
  appKey: string
  timezone: string
  nodeEnv: 'development' | 'production' | 'test'
  port: number
}

export const appConfig: AppConfig = {
  appKey: env.get('APP_KEY', 'cf-first-super-secret-adonis-app-key-32chars'),
  timezone: env.get('TZ', 'Asia/Taipei'),
  nodeEnv: env.get('NODE_ENV', 'development'),
  port: env.get('PORT', 8787)
}
