import { Database, QueryBuilder, TransactionClient } from './database'
import { dateTime, DateTime } from './time'
import { getModelRelations, RelationClient } from './relations'
import { HttpException } from './exception_handler'

export interface ModelQueryOptions {
  client?: TransactionClient | typeof Database
}

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

  static query<T extends typeof BaseModel>(this: T, options?: ModelQueryOptions): ModelQueryBuilder<T> {
    const tableName = (this as typeof BaseModel).getTableName()
    const dbQuery = options?.client
      ? options.client.from(tableName)
      : Database.from(tableName)
    return new ModelQueryBuilder<T>(this, dbQuery)
  }

  static async all<T extends typeof BaseModel>(this: T): Promise<Array<InstanceType<T>>> {
    return await (this as any).query().all()
  }

  static async find<T extends typeof BaseModel>(this: T, id: any): Promise<InstanceType<T> | null> {
    const key = (this as typeof BaseModel).primaryKey || 'id'
    return await (this as any).query().where(key, id).first()
  }

  static async findOrFail<T extends typeof BaseModel>(this: T, id: any): Promise<InstanceType<T>> {
    const key = (this as typeof BaseModel).primaryKey || 'id'
    const instance = await (this as any).query().where(key, id).first()
    if (!instance) {
      throw new HttpException(`找不到 ID 為 ${id} 的 ${(this as any).name} 資料`, 404, 'E_ROW_NOT_FOUND')
    }
    return instance
  }

  static async findBy<T extends typeof BaseModel>(this: T, column: string, value: any): Promise<InstanceType<T> | null> {
    return await (this as any).query().where(column, value).first()
  }

  static async findByOrFail<T extends typeof BaseModel>(this: T, column: string, value: any): Promise<InstanceType<T>> {
    const instance = await (this as any).query().where(column, value).first()
    if (!instance) {
      throw new HttpException(`找不到 ${column} 為 ${value} 的 ${(this as any).name} 資料`, 404, 'E_ROW_NOT_FOUND')
    }
    return instance
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
   * 懶載入關聯資料 (AdonisJS await model.load('notes', (query) => ...))
   */
  async load(relationName: string, callback?: (query: any) => void): Promise<this> {
    const client = this.related(relationName)
    const result = await client.get(callback)
    ;(this as any)[relationName] = result
    return this
  }

  /**
   * 批次預載入關聯資料 (Eager Loading / Preload)
   * @deprecated 建議改用 Model.query().preload(...) 或 model.load(...)
   */
  static async preload<T extends typeof BaseModel>(
    this: T,
    models: Array<InstanceType<T>>,
    relationName: string,
    callback?: (query: ModelQueryBuilder<any>) => void
  ): Promise<Array<InstanceType<T>>> {
    if (models.length === 0) return models
    const qb = new ModelQueryBuilder(this, Database.from((this as any).getTableName()))
    qb.preload(relationName, callback)
    await qb.eagerLoad(models)
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

export interface PreloadDefinition {
  relation: string
  callback?: (query: ModelQueryBuilder<any>) => void
}

/**
 * AdonisJS / Lucid 風格之 Model 查詢構建器
 * 支援 Thenable (直接 await)、.preload(...) 關聯預載入與 Model 實例自動封裝
 */
export class ModelQueryBuilder<T extends typeof BaseModel = typeof BaseModel> implements PromiseLike<Array<InstanceType<T>>> {
  private preloads: PreloadDefinition[] = []

  constructor(
    public modelClass: T,
    private dbQuery: QueryBuilder<any>
  ) {}

  /**
   * 綁定事務交易客戶端 (AdonisJS Lucid query.useTransaction(trx))
   */
  useTransaction(trx: TransactionClient | typeof Database): this {
    const tableName = (this.modelClass as typeof BaseModel).getTableName()
    this.dbQuery = trx.from(tableName)
    return this
  }

  /**
   * 悲觀鎖排他查詢 (AdonisJS Lucid query.forUpdate(...tableNames))
   */
  forUpdate(...tableNames: string[]): this {
    this.dbQuery.forUpdate(...tableNames)
    return this
  }

  /**
   * 悲觀鎖共享查詢 (AdonisJS Lucid query.forShare(...tableNames))
   */
  forShare(...tableNames: string[]): this {
    this.dbQuery.forShare(...tableNames)
    return this
  }

  getLockMode(): 'forUpdate' | 'forShare' | undefined {
    return this.dbQuery.getLockMode()
  }

  getLockTables(): string[] | undefined {
    return this.dbQuery.getLockTables()
  }

  /**
   * 編譯當前查詢為 SQL 字串與參數綁定陣列 (AdonisJS Lucid query.toSQL())
   */
  toSQL(): { sql: string; bindings: any[] } {
    return this.dbQuery.toSQL()
  }

  select(...fields: string[]): this {
    this.dbQuery.select(...fields)
    return this
  }

  where(column: string, operatorOrValue: any, value?: any): this {
    this.dbQuery.where(column, operatorOrValue, value)
    return this
  }

  whereIn(column: string, values: any[]): this {
    this.dbQuery.whereIn(column, values)
    return this
  }

  orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): this {
    this.dbQuery.orderBy(column, direction)
    return this
  }

  limit(count: number): this {
    this.dbQuery.limit(count)
    return this
  }

  offset(count: number): this {
    this.dbQuery.offset(count)
    return this
  }

  /**
   * 鏈式預載入關聯資料，支援可選的自訂查詢 callback
   * 例如: .preload('user') 或 .preload('user', (q) => q.select('id', 'email'))
   */
  preload(relationName: string, callback?: (query: ModelQueryBuilder<any>) => void): this {
    this.preloads.push({ relation: relationName, callback })
    return this
  }

  /**
   * 取得第一筆結果並封裝為 Model 實例，同時處理預載入
   */
  async first(): Promise<InstanceType<T> | null> {
    const row = await this.dbQuery.first()
    if (!row) return null

    const instance = new (this.modelClass as any)(row) as InstanceType<T>
    if (this.preloads.length > 0) {
      await this.eagerLoad([instance])
    }
    return instance
  }

  /**
   * 取得第一筆結果，若查無資料則拋出 404 HttpException (E_ROW_NOT_FOUND)
   */
  async firstOrFail(): Promise<InstanceType<T>> {
    const instance = await this.first()
    if (!instance) {
      const modelName = (this.modelClass as any).name || 'Row'
      throw new HttpException(`找不到符合條件的 ${modelName} 資料`, 404, 'E_ROW_NOT_FOUND')
    }
    return instance
  }

  /**
   * 取得所有符合條件的 Model 實例，並批次加載所有指定的預載關聯
   */
  async all(): Promise<Array<InstanceType<T>>> {
    const rows = await this.dbQuery.all()
    const instances = rows.map((r: any) => new (this.modelClass as any)(r) as InstanceType<T>)

    if (instances.length > 0 && this.preloads.length > 0) {
      await this.eagerLoad(instances)
    }

    return instances
  }

  async exec(): Promise<Array<InstanceType<T>>> {
    return this.all()
  }

  /**
   * 實作 PromiseLike / Thenable，支援直接 await Note.query().preload('user')
   */
  then<TResult1 = Array<InstanceType<T>>, TResult2 = never>(
    onfulfilled?: ((value: Array<InstanceType<T>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.all().then(onfulfilled, onrejected)
  }

  /**
   * 批次預載入邏輯（Eager Loading 防止 N+1）
   */
  async eagerLoad(models: Array<InstanceType<T>>): Promise<void> {
    if (models.length === 0) return

    const relations = getModelRelations(this.modelClass)
    const primaryKey = (this.modelClass as any).primaryKey || 'id'

    for (const preloadDef of this.preloads) {
      const relationName = preloadDef.relation
      const meta = relations[relationName]
      if (!meta) {
        throw new Error(`Relation [${relationName}] is not defined on model [${(this.modelClass as any).name}].`)
      }

      const TargetModel = meta.modelLoader()
      const targetPrimaryKey = TargetModel.primaryKey || 'id'

      switch (meta.type) {
        case 'belongsTo': {
          const foreignKey = meta.foreignKey || `${TargetModel.name.replace(/Model$/i, '').toLowerCase()}_id`
          const foreignIds = Array.from(new Set(models.map((m: any) => m[foreignKey]).filter((id: any) => id !== undefined && id !== null)))
          if (foreignIds.length === 0) {
            for (const model of models) {
              ;(model as any)[relationName] = null
            }
            break
          }

          const targetQuery = TargetModel.query().whereIn(targetPrimaryKey, foreignIds)
          if (preloadDef.callback) {
            preloadDef.callback(targetQuery)
          }

          const parents = await targetQuery.all()
          for (const model of models) {
            const matched = parents.find((p: any) => String(p[targetPrimaryKey]) === String((model as any)[foreignKey]))
            ;(model as any)[relationName] = matched || null
          }
          break
        }

        case 'hasMany': {
          const foreignKey = meta.foreignKey || `${(this.modelClass as any).name.replace(/Model$/i, '').toLowerCase()}_id`
          const localIds = Array.from(new Set(models.map((m: any) => m[primaryKey]).filter((id: any) => id !== undefined && id !== null)))
          if (localIds.length === 0) {
            for (const model of models) {
              ;(model as any)[relationName] = []
            }
            break
          }

          const targetQuery = TargetModel.query().whereIn(foreignKey, localIds)
          if (preloadDef.callback) {
            preloadDef.callback(targetQuery)
          }

          const children = await targetQuery.all()
          for (const model of models) {
            const matched = children.filter((c: any) => String(c[foreignKey]) === String((model as any)[primaryKey]))
            ;(model as any)[relationName] = matched
          }
          break
        }

        case 'hasOne': {
          const foreignKey = meta.foreignKey || `${(this.modelClass as any).name.replace(/Model$/i, '').toLowerCase()}_id`
          const localIds = Array.from(new Set(models.map((m: any) => m[primaryKey]).filter((id: any) => id !== undefined && id !== null)))
          if (localIds.length === 0) {
            for (const model of models) {
              ;(model as any)[relationName] = null
            }
            break
          }

          const targetQuery = TargetModel.query().whereIn(foreignKey, localIds)
          if (preloadDef.callback) {
            preloadDef.callback(targetQuery)
          }

          const children = await targetQuery.all()
          for (const model of models) {
            const matched = children.find((c: any) => String(c[foreignKey]) === String((model as any)[primaryKey]))
            ;(model as any)[relationName] = matched || null
          }
          break
        }
      }
    }
  }
}
