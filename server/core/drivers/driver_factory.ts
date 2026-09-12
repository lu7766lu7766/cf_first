import { databaseConfig } from '../../config/database'
import { D1Driver } from './d1_driver'
import { PostgresDriver } from './postgres_driver'
import { MySqlDriver } from './mysql_driver'
import type { DatabaseDriver } from './types'

export interface DriverFactoryOptions {
  connectionName?: string
  isRemote?: boolean
  env?: any
  projectRoot?: string
}

export class DriverFactory {
  private static drivers = new Map<string, DatabaseDriver>()

  static getDriver(options: DriverFactoryOptions = {}): DatabaseDriver {
    const connName = options.connectionName || databaseConfig.default || 'd1'
    const cacheKey = `${connName}:${options.isRemote ? 'remote' : 'local'}`

    if (this.drivers.has(cacheKey)) {
      const driver = this.drivers.get(cacheKey)!
      if (driver instanceof D1Driver && options.env) {
        driver.setEnv(options.env)
      }
      return driver
    }

    let driver: DatabaseDriver

    switch (connName) {
      case 'd1':
      case 'sqlite': {
        driver = new D1Driver({
          isRemote: options.isRemote,
          env: options.env,
          projectRoot: options.projectRoot
        })
        break
      }

      case 'postgres':
      case 'pg': {
        const conf = databaseConfig.connections.postgres || {}
        driver = new PostgresDriver({
          connectionString: conf.connectionString,
          host: conf.host,
          port: conf.port,
          user: conf.user,
          password: conf.password,
          database: conf.database
        })
        break
      }

      case 'mysql':
      case 'mysql2': {
        const conf = databaseConfig.connections.mysql || {}
        driver = new MySqlDriver({
          connectionString: conf.connectionString,
          host: conf.host,
          port: conf.port,
          user: conf.user,
          password: conf.password,
          database: conf.database
        })
        break
      }

      default:
        throw new Error(`[DriverFactory] 不支援的資料庫連線類型: "${connName}" (支援: d1, sqlite, postgres, mysql)`)
    }

    this.drivers.set(cacheKey, driver)
    return driver
  }

  static async closeAll(): Promise<void> {
    for (const driver of this.drivers.values()) {
      try {
        await driver.close()
      } catch {}
    }
    this.drivers.clear()
  }
}
