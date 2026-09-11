export interface DatabaseConfig {
  default: string
  connections: {
    d1: {
      client: 'd1'
      binding: string
    }
    sqlite: {
      client: 'sqlite'
      filename: string
    }
    postgres: {
      client: 'pg'
      connectionString?: string
    }
    mysql: {
      client: 'mysql2'
      connectionString?: string
    }
  }
}

export const databaseConfig: DatabaseConfig = {
  default: 'd1',
  connections: {
    d1: {
      client: 'd1',
      binding: 'DB'
    },
    sqlite: {
      client: 'sqlite',
      filename: ':memory:'
    },
    postgres: {
      client: 'pg',
      connectionString: process.env.DATABASE_URL
    },
    mysql: {
      client: 'mysql2',
      connectionString: process.env.MYSQL_URL
    }
  }
}
