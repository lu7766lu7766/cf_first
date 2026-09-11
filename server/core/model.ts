import { Database, QueryBuilder } from './database'

export type ModelHookFn<T = any> = (model: T) => Promise<void> | void

export interface BaseModel {
  [key: string]: any
}

export class BaseModel {
  static table: string = ''
  static primaryKey: string = 'id'

  static hooks = {
    beforeCreate: [] as ModelHookFn[],
    afterCreate: [] as ModelHookFn[],
    beforeSave: [] as ModelHookFn[],
    afterSave: [] as ModelHookFn[],
    beforeDelete: [] as ModelHookFn[],
    afterDelete: [] as ModelHookFn[]
  }

  constructor(attributes: Record<string, any> = {}) {
    Object.assign(this, attributes)
  }

  static getTableName(this: typeof BaseModel): string {
    return this.table || this.name.toLowerCase() + 's'
  }

  static query<T extends typeof BaseModel>(this: T): QueryBuilder<InstanceType<T>> {
    const tableName = (this as typeof BaseModel).getTableName()
    return Database.from(tableName) as any
  }

  static async all<T extends typeof BaseModel>(this: T): Promise<Array<InstanceType<T>>> {
    const rows = await this.query().all()
    return rows.map((r: any) => new (this as any)(r) as InstanceType<T>)
  }

  static async find<T extends typeof BaseModel>(this: T, id: any): Promise<InstanceType<T> | null> {
    const key = (this as typeof BaseModel).primaryKey || 'id'
    const row = await this.query().where(key, id).first()
    return row ? (new (this as any)(row) as InstanceType<T>) : null
  }

  static async findBy<T extends typeof BaseModel>(this: T, column: string, value: any): Promise<InstanceType<T> | null> {
    const row = await this.query().where(column, value).first()
    return row ? (new (this as any)(row) as InstanceType<T>) : null
  }

  static async create<T extends typeof BaseModel>(this: T, attributes: Record<string, any>): Promise<InstanceType<T>> {
    const instance = new (this as any)(attributes) as InstanceType<T>
    const modelClass = this as typeof BaseModel

    // 觸發 beforeCreate 與 beforeSave
    for (const hook of modelClass.hooks.beforeCreate) await hook(instance)
    for (const hook of modelClass.hooks.beforeSave) await hook(instance)

    const tableName = modelClass.getTableName()
    const inserted = await Database.from(tableName).insert(attributes)
    Object.assign(instance, inserted)

    // 觸發 afterCreate 與 afterSave
    for (const hook of modelClass.hooks.afterCreate) await hook(instance)
    for (const hook of modelClass.hooks.afterSave) await hook(instance)

    return instance
  }

  async save(): Promise<this> {
    const constructor = this.constructor as typeof BaseModel
    const tableName = constructor.getTableName()
    const primaryKey = constructor.primaryKey || 'id'
    const primaryVal = (this as any)[primaryKey]

    for (const hook of constructor.hooks.beforeSave) await hook(this)

    if (primaryVal) {
      await Database.from(tableName).where(primaryKey, primaryVal).update(this)
    } else {
      const inserted = await Database.from(tableName).insert(this)
      Object.assign(this, inserted)
    }

    for (const hook of constructor.hooks.afterSave) await hook(this)
    return this
  }

  async delete(): Promise<boolean> {
    const constructor = this.constructor as typeof BaseModel
    const tableName = constructor.getTableName()
    const primaryKey = constructor.primaryKey || 'id'
    const primaryVal = (this as any)[primaryKey]

    for (const hook of constructor.hooks.beforeDelete) await hook(this)
    const affected = await Database.from(tableName).where(primaryKey, primaryVal).delete()
    for (const hook of constructor.hooks.afterDelete) await hook(this)

    return affected > 0
  }

  toJSON(): Record<string, any> {
    const copy: Record<string, any> = {}
    for (const key of Object.keys(this)) {
      if (typeof (this as any)[key] !== 'function') {
        copy[key] = (this as any)[key]
      }
    }
    return copy
  }

  // Hook 註冊輔助器
  static beforeCreate(this: typeof BaseModel, fn: ModelHookFn) {
    this.hooks.beforeCreate.push(fn)
  }

  static afterCreate(this: typeof BaseModel, fn: ModelHookFn) {
    this.hooks.afterCreate.push(fn)
  }
}
