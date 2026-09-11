import { Database, QueryBuilder } from './database'
import { dateTime, DateTime } from './time'
import { getModelRelations, RelationClient } from './relations'

export type ModelHookFn<T = any> = (model: T) => Promise<void> | void

export interface BaseModel {
  [key: string]: any
}

export class BaseModel {
  static table: string = ''
  static primaryKey: string = 'id'
  static hidden: string[] = []

  static hooks = {
    beforeCreate: [] as ModelHookFn[],
    afterCreate: [] as ModelHookFn[],
    beforeSave: [] as ModelHookFn[],
    afterSave: [] as ModelHookFn[],
    beforeDelete: [] as ModelHookFn[],
    afterDelete: [] as ModelHookFn[]
  }

  declare created_at: DateTime
  declare updated_at: DateTime

  constructor(attributes: Record<string, any> = {}) {
    Object.assign(this, attributes)

    // 自動轉換 created_at 與 updated_at 為 Luxon DateTime 實例
    if (this.created_at && !DateTime.isDateTime(this.created_at)) {
      this.created_at = this.parseToDateTime(this.created_at)
    }
    if (this.updated_at && !DateTime.isDateTime(this.updated_at)) {
      this.updated_at = this.parseToDateTime(this.updated_at)
    }
  }

  /**
   * 將傳入值統一轉換為 Luxon DateTime
   */
  protected parseToDateTime(val: any): DateTime {
    if (DateTime.isDateTime(val)) return val
    if (typeof val === 'string') {
      const dt = dateTime.fromISO(val)
      if (dt.isValid) return dt
      const dtSql = dateTime.fromSQL(val)
      if (dtSql.isValid) return dtSql
    }
    if (val instanceof Date) {
      return dateTime.fromJSDate(val)
    }
    return dateTime.now()
  }

  /**
   * 駝峰式 createdAt / updatedAt 雙向相容存取器
   */
  get createdAt(): DateTime {
    return this.created_at
  }
  set createdAt(val: any) {
    this.created_at = this.parseToDateTime(val)
  }

  get updatedAt(): DateTime {
    return this.updated_at
  }
  set updatedAt(val: any) {
    this.updated_at = this.parseToDateTime(val)
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
    const modelClass = this as typeof BaseModel
    const now = dateTime.now()

    const instance = new (this as any)({
      created_at: now,
      updated_at: now,
      ...attributes
    }) as InstanceType<T>

    // 觸發 beforeCreate 與 beforeSave
    for (const hook of modelClass.hooks.beforeCreate) await hook(instance)
    for (const hook of modelClass.hooks.beforeSave) await hook(instance)

    const tableName = modelClass.getTableName()
    const relations = getModelRelations(modelClass)
    const payloadForDb: Record<string, any> = {}
    for (const [k, v] of Object.entries(instance)) {
      if (typeof v !== 'function' && !relations[k]) {
        payloadForDb[k] = DateTime.isDateTime(v) ? (v as DateTime).toFormat('yyyy-MM-dd HH:mm:ss') : v
      }
    }

    const inserted = await Database.from(tableName).insert(payloadForDb)
    Object.assign(instance, inserted)

    // 重新封裝 DateTime
    if (instance.created_at && !DateTime.isDateTime(instance.created_at)) {
      instance.created_at = (instance as any).parseToDateTime(instance.created_at)
    }
    if (instance.updated_at && !DateTime.isDateTime(instance.updated_at)) {
      instance.updated_at = (instance as any).parseToDateTime(instance.updated_at)
    }

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
    const now = dateTime.now()

    this.updated_at = now

    for (const hook of constructor.hooks.beforeSave) await hook(this)

    const relations = getModelRelations(constructor)
    const payloadForDb: Record<string, any> = {}
    for (const [k, v] of Object.entries(this)) {
      if (typeof v !== 'function' && !relations[k]) {
        payloadForDb[k] = DateTime.isDateTime(v) ? (v as DateTime).toFormat('yyyy-MM-dd HH:mm:ss') : v
      }
    }

    if (primaryVal) {
      await Database.from(tableName).where(primaryKey, primaryVal).update(payloadForDb)
    } else {
      if (!this.created_at) this.created_at = now
      payloadForDb.created_at = this.created_at.toFormat('yyyy-MM-dd HH:mm:ss')
      const inserted = await Database.from(tableName).insert(payloadForDb)
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

  /**
   * 取得關聯查詢客戶端 (AdonisJS model.related('notes').query())
   */
  related(relationName: string): RelationClient {
    const relations = getModelRelations(this.constructor)
    const meta = relations[relationName]
    if (!meta) {
      throw new Error(`Relation [${relationName}] is not defined on model [${(this.constructor as any).name}].`)
    }
    return new RelationClient(this, meta)
  }

  /**
   * 懶載入關聯資料 (AdonisJS await model.load('notes'))
   */
  async load(relationName: string): Promise<this> {
    const client = this.related(relationName)
    const result = await client.get()
    ;(this as any)[relationName] = result
    return this
  }

  /**
   * 批次預載入關聯資料 (Eager Loading / Preload)
   */
  static async preload<T extends typeof BaseModel>(
    this: T,
    models: Array<InstanceType<T>>,
    relationName: string
  ): Promise<Array<InstanceType<T>>> {
    if (models.length === 0) return models
    const relations = getModelRelations(this)
    const meta = relations[relationName]
    if (!meta) {
      throw new Error(`Relation [${relationName}] is not defined on model [${this.name}].`)
    }

    const TargetModel = meta.modelLoader()
    const primaryKey = (this as any).primaryKey || 'id'
    const targetPrimaryKey = TargetModel.primaryKey || 'id'

    switch (meta.type) {
      case 'hasMany': {
        const foreignKey = meta.foreignKey || `${this.name.replace(/Model$/i, '').toLowerCase()}_id`
        const localIds = models.map((m: any) => m[primaryKey]).filter(Boolean)
        const allChildren = await TargetModel.query().whereIn(foreignKey, localIds).all()
        const childrenInstances = allChildren.map((c: any) => new TargetModel(c))

        for (const model of models) {
          const matched = childrenInstances.filter((c: any) => String(c[foreignKey]) === String((model as any)[primaryKey]))
          ;(model as any)[relationName] = matched
        }
        break
      }

      case 'hasOne': {
        const foreignKey = meta.foreignKey || `${this.name.replace(/Model$/i, '').toLowerCase()}_id`
        const localIds = models.map((m: any) => m[primaryKey]).filter(Boolean)
        const allChildren = await TargetModel.query().whereIn(foreignKey, localIds).all()
        const childrenInstances = allChildren.map((c: any) => new TargetModel(c))

        for (const model of models) {
          const matched = childrenInstances.find((c: any) => String(c[foreignKey]) === String((model as any)[primaryKey]))
          ;(model as any)[relationName] = matched || null
        }
        break
      }

      case 'belongsTo': {
        const foreignKey = meta.foreignKey || `${TargetModel.name.replace(/Model$/i, '').toLowerCase()}_id`
        const foreignIds = models.map((m: any) => m[foreignKey]).filter(Boolean)
        const allParents = await TargetModel.query().whereIn(targetPrimaryKey, foreignIds).all()
        const parentInstances = allParents.map((p: any) => new TargetModel(p))

        for (const model of models) {
          const matched = parentInstances.find((p: any) => String(p[targetPrimaryKey]) === String((model as any)[foreignKey]))
          ;(model as any)[relationName] = matched || null
        }
        break
      }
    }

    return models
  }

  toJSON(): Record<string, any> {
    const constructor = this.constructor as typeof BaseModel
    const hiddenSet = new Set(constructor.hidden || [])
    const copy: Record<string, any> = {}

    for (const key of Object.keys(this)) {
      if (typeof (this as any)[key] !== 'function' && !hiddenSet.has(key)) {
        const val = (this as any)[key]
        if (DateTime.isDateTime(val)) {
          copy[key] = val.toISO()
        } else if (val && typeof val.toJSON === 'function') {
          copy[key] = val.toJSON()
        } else if (Array.isArray(val)) {
          copy[key] = val.map((item) => (item && typeof item.toJSON === 'function' ? item.toJSON() : item))
        } else {
          copy[key] = val
        }
      }
    }

    // 雙向相容：確保 createdAt 與 updatedAt 序列化
    if (this.created_at && !copy.createdAt) {
      copy.createdAt = DateTime.isDateTime(this.created_at) ? this.created_at.toISO() : this.created_at
    }
    if (this.updated_at && !copy.updatedAt) {
      copy.updatedAt = DateTime.isDateTime(this.updated_at) ? this.updated_at.toISO() : this.updated_at
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
