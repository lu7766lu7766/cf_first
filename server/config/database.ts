import { env } from '../start/env'

export interface DatabaseConnectionConfig {
  client: string
  binding?: string
  filename?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  connectionString?: string
}

export interface DatabaseConfig {
  default: 'd1' | 'sqlite' | 'postgres' | 'mysql' | string
  connections: {
    d1: {
      client: 'd1'
      binding: string
    }
    sqlite: {
      client: 'sqlite'
      filename: string
    }
    postgres: DatabaseConnectionConfig
    mysql: DatabaseConnectionConfig
    [key: string]: DatabaseConnectionConfig
  }
}

const dbHost = env.get('DB_HOST', '127.0.0.1')
const dbPort = Number(env.get('DB_PORT', 3306))
const dbUser = env.get('DB_USER', 'root')
const dbPassword = env.get('DB_PASSWORD', '')
const dbName = env.get('DB_DATABASE', 'cf_first')
const databaseUrl = env.get('DATABASE_URL')

export const databaseConfig: DatabaseConfig = {
  default: env.get('DB_CONNECTION', 'd1'),
  connections: {
    d1: {
      client: 'd1',
      binding: env.get('D1_BINDING', 'DB')
    },
    sqlite: {
      client: 'sqlite',
      filename: env.get('DB_DATABASE', ':memory:')
    },
    postgres: {
      client: 'pg',
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectionString: databaseUrl || `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
    },
    mysql: {
      client: 'mysql2',
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectionString: databaseUrl || `mysql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
    }
  }
}
