import { BaseSchema } from '../../core/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('username').notNullable().unique()
      table.string('email').nullable()
      table.string('password').notNullable()
      table.string('full_name').nullable()
      table.timestamp('created_at').defaultTo(this.now())
      table.timestamp('updated_at').defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
