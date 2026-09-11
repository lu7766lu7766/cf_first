import { BaseSchema } from '../../core/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('tokenable_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('type').notNullable().defaultTo('auth_token')
      table.string('name').nullable()
      table.string('hash').notNullable().index()
      table.text('abilities').notNullable().defaultTo('["*"]')
      table.timestamp('created_at').defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
