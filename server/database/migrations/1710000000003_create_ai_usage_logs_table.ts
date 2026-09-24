import { BaseSchema } from '../../core/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_usage_logs'

  async up() {
    this.schema.createTableIfNotExists(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().nullable()
      table.string('model').notNullable()
      table.text('prompt').notNullable()
      table.text('response').notNullable()
      table.integer('tokens_used').defaultTo(0)
      table.integer('duration_ms').defaultTo(0)
      table.integer('is_mock').defaultTo(0)
      table.string('status').defaultTo('success')
      table.timestamp('created_at').defaultTo(this.now())
      table.timestamp('updated_at').defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
