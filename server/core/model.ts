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
  static columns?: string[]
  private static tableColumnsCache = new Map<string, string[]>()

  /**
   * 自動解析並快取資料表所有欄位：
   * 1. 優先使用手動定義的 static columns（若有）
   * 2. 若連接 D1，透過 PRAGMA table_info 自動檢測並快取在記憶體
   * 3. 若為本機/測試記憶體資料庫，從第一筆紀錄自動推斷鍵名
   * 4. 預設兜底基礎欄位
   */
  static async getColumns(this: typeof BaseModel): Promise<string[]> {
    const tableName = (this as typeof BaseModel).getTableName()
    if (BaseModel.tableColumnsCache.has(tableName)) {
      return BaseModel.tableColumnsCache.get(tableName)!
    }

    if (this.columns && this.columns.length > 0) {
      BaseModel.tableColumnsCache.set(tableName, this.columns)
      return this.columns
    }

    try {
      const driver = Database.getDriver()
      const cols = await driver.getTableColumns(tableName)
      if (cols && cols.length > 0) {
        BaseModel.tableColumnsCache.set(tableName, cols)
        return cols
      }
    } catch {
      // fallback
    }

    const memoryData = Database.getMemoryTable(tableName)
    if (memoryData && memoryData.length > 0) {
      const cols = Object.keys(memoryData[0]).filter((k) => !k.startsWith('_'))
      BaseModel.tableColumnsCache.set(tableName, cols)
      return cols
    }

    return ['id', 'created_at', 'updated_at']
  }

  static hooks = {
    beforeCreate: [] as ModelHookFn[],
    afterCreate: [] as ModelHookFn[],
    beforeSave: [] as ModelHookFn[],
    afterSave: [] as ModelHookFn[],
    beforeDelete: [] as ModelHookFn[],
    afterDelete: [] as ModelHookFn[]
  }

  private _created_at_dt?: DateTime | null
  private _updated_at_dt?: DateTime | null
  private _raw_created_at?: any
  private _raw_updated_at?: any

  constructor(attributes: Record<string, any> = {}) {
    const { created_at, updated_at, createdAt, updatedAt, ...rest } = attributes
    Object.assign(this, rest)

    const rawCreated = created_at !== undefined ? created_at : createdAt
    if (rawCreated !== undefined) {
      if (DateTime.isDateTime(rawCreated)) {
        this._created_at_dt = rawCreated
        this._raw_created_at = rawCreated.toISO()
      } else {
        this._raw_created_at = rawCreated
        this._created_at_dt = null
      }
    }

    const rawUpdated = updated_at !== undefined ? updated_at : updatedAt
    if (rawUpdated !== undefined) {
      if (DateTime.isDateTime(rawUpdated)) {
        this._updated_at_dt = rawUpdated
        this._raw_updated_at = rawUpdated.toISO()
      } else {
        this._raw_updated_at = rawUpdated
        this._updated_at_dt = null
      }
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

  declare created_at: DateTime
  declare updated_at: DateTime

  /**
   * 駝峰式 createdAt / updatedAt 雙向相容存取器
   */
  get createdAt(): DateTime {
    return (this as any).created_at
  }
  set createdAt(val: any) {
    ;(this as any).created_at = val
  }

  get updatedAt(): DateTime {
    return (this as any).updated_at
  }
  set updatedAt(val: any) {
    ;(this as any).updated_at = val
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
      if (typeof v !== 'function' && !relations[k] && !k.startsWith('_')) {
        payloadForDb[k] = DateTime.isDateTime(v) ? (v as DateTime).toFormat('yyyy-MM-dd HH:mm:ss') : v
      }
    }
    if (!payloadForDb.created_at && instance.created_at) {
      payloadForDb.created_at = DateTime.isDateTime(instance.created_at)
        ? (instance.created_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
        : String(instance.created_at)
    }
    if (!payloadForDb.updated_at && instance.updated_at) {
      payloadForDb.updated_at = DateTime.isDateTime(instance.updated_at)
        ? (instance.updated_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
        : String(instance.updated_at)
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

  static async createMany<T extends typeof BaseModel>(this: T, records: Array<Record<string, any>>): Promise<Array<InstanceType<T>>> {
    const modelClass = this as typeof BaseModel
    const now = dateTime.now()
    const instances: Array<InstanceType<T>> = []
    const payloadsForDb: Array<Record<string, any>> = []
    const relations = getModelRelations(modelClass)

    for (const attr of records) {
      const instance = new (this as any)({
        created_at: now,
        updated_at: now,
        ...attr
      }) as InstanceType<T>

      // 觸發 beforeCreate 與 beforeSave
      for (const hook of modelClass.hooks.beforeCreate) await hook(instance)
      for (const hook of modelClass.hooks.beforeSave) await hook(instance)

      const payload: Record<string, any> = {}
      for (const [k, v] of Object.entries(instance)) {
        if (typeof v !== 'function' && !relations[k] && !k.startsWith('_')) {
          payload[k] = DateTime.isDateTime(v) ? (v as DateTime).toFormat('yyyy-MM-dd HH:mm:ss') : v
        }
      }
      if (!payload.created_at && instance.created_at) {
        payload.created_at = DateTime.isDateTime(instance.created_at)
          ? (instance.created_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
          : String(instance.created_at)
      }
      if (!payload.updated_at && instance.updated_at) {
        payload.updated_at = DateTime.isDateTime(instance.updated_at)
          ? (instance.updated_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
          : String(instance.updated_at)
      }
      payloadsForDb.push(payload)
      instances.push(instance)
    }

    const tableName = modelClass.getTableName()
    const insertedList = await Database.from(tableName).insert(payloadsForDb)
    const results = Array.isArray(insertedList) ? insertedList : [insertedList]

    for (let i = 0; i < instances.length; i++) {
      if (results[i]) {
        Object.assign(instances[i], results[i])
      }
      if (instances[i].created_at && !DateTime.isDateTime(instances[i].created_at)) {
        instances[i].created_at = (instances[i] as any).parseToDateTime(instances[i].created_at)
      }
      if (instances[i].updated_at && !DateTime.isDateTime(instances[i].updated_at)) {
        instances[i].updated_at = (instances[i] as any).parseToDateTime(instances[i].updated_at)
      }

      // 觸發 afterCreate 與 afterSave
      for (const hook of modelClass.hooks.afterCreate) await hook(instances[i])
      for (const hook of modelClass.hooks.afterSave) await hook(instances[i])
    }

    return instances
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
      if (typeof v !== 'function' && !relations[k] && !k.startsWith('_')) {
        payloadForDb[k] = DateTime.isDateTime(v) ? (v as DateTime).toFormat('yyyy-MM-dd HH:mm:ss') : v
      }
    }
    if (this.created_at && !payloadForDb.created_at) {
      payloadForDb.created_at = DateTime.isDateTime(this.created_at)
        ? (this.created_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
        : String(this.created_at)
    }
    if (this.updated_at && !payloadForDb.updated_at) {
      payloadForDb.updated_at = DateTime.isDateTime(this.updated_at)
        ? (this.updated_at as DateTime).toFormat('yyyy-MM-dd HH:mm:ss')
        : String(this.updated_at)
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
      if (key.startsWith('_') || typeof (this as any)[key] === 'function' || hiddenSet.has(key)) {
        continue
      }
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

    // 雙向相容：確保 created_at / createdAt 與 updated_at / updatedAt 序列化 (優先取 rawString，避免無謂 DateTime.toISO)
    const rawCreated = this._raw_created_at || (this._created_at_dt ? this._created_at_dt.toISO() : null)
    if (rawCreated && !hiddenSet.has('created_at')) {
      copy.created_at = rawCreated
      if (!hiddenSet.has('createdAt')) copy.createdAt = rawCreated
    }

    const rawUpdated = this._raw_updated_at || (this._updated_at_dt ? this._updated_at_dt.toISO() : null)
    if (rawUpdated && !hiddenSet.has('updated_at')) {
      copy.updated_at = rawUpdated
      if (!hiddenSet.has('updatedAt')) copy.updatedAt = rawUpdated
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

// 動態在 BaseModel.prototype 上定義 created_at 與 updated_at 的 Lazy 存取器，消除子類別欄位衝突
Object.defineProperty(BaseModel.prototype, 'created_at', {
  get(this: any) {
    if (this._created_at_dt) return this._created_at_dt
    if (this._raw_created_at) {
      this._created_at_dt = this.parseToDateTime(this._raw_created_at)
      return this._created_at_dt
    }
    return undefined
  },
  set(this: any, val: any) {
    if (DateTime.isDateTime(val)) {
      this._created_at_dt = val
      this._raw_created_at = val.toISO()
    } else {
      this._raw_created_at = val
      this._created_at_dt = null
    }
  },
  configurable: true,
  enumerable: true
})

Object.defineProperty(BaseModel.prototype, 'updated_at', {
  get(this: any) {
    if (this._updated_at_dt) return this._updated_at_dt
    if (this._raw_updated_at) {
      this._updated_at_dt = this.parseToDateTime(this._raw_updated_at)
      return this._updated_at_dt
    }
    return undefined
  },
  set(this: any, val: any) {
    if (DateTime.isDateTime(val)) {
      this._updated_at_dt = val
      this._raw_updated_at = val.toISO()
    } else {
      this._raw_updated_at = val
      this._updated_at_dt = null
    }
  },
  configurable: true,
  enumerable: true
})

export interface PreloadDefinition {
  relation: string
  callback?: (query: ModelQueryBuilder<any>) => void
  strategy?: 'join' | 'select'
}

/**
 * AdonisJS / Lucid 風格之 Model 查詢構建器
 * 支援 Thenable (直接 await)、單次 SQL JOIN (.withJoin)、.preload(...) 關聯預載入與 Model 實例自動封裝
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
   * 鏈式預載入關聯資料，支援可選的自訂查詢 callback 與 strategy
   * 對於 belongsTo 與 hasOne，預設自動採用高效單次 SQL JOIN
   */
  preload(relationName: string, callback?: (query: ModelQueryBuilder<any>) => void, strategy?: 'join' | 'select'): this {
    this.preloads.push({ relation: relationName, callback, strategy })
    return this
  }

  /**
   * 顯式宣告以單次 SQL LEFT JOIN 方式預載關聯，消除額外的 D1 往返延遲
   */
  withJoin(relationName: string, callback?: (query: ModelQueryBuilder<any>) => void): this {
    return this.preload(relationName, callback, 'join')
  }

  /**
   * 取得第一筆結果並封裝為 Model 實例，同時處理預載入
   */
  async first(): Promise<InstanceType<T> | null> {
    const list = await this.limit(1).all()
    return list[0] || null
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
   * 取得所有符合條件的 Model 實例，並以單次 SQL JOIN 或批次加載所有指定的預載關聯
   */
  async all(): Promise<Array<InstanceType<T>>> {
    const relations = getModelRelations(this.modelClass)
    const joinPreloads: PreloadDefinition[] = []
    const selectPreloads: PreloadDefinition[] = []

    for (const p of this.preloads) {
      const meta = relations[p.relation]
      // belongsTo 與 hasOne 預設走單次 SQL JOIN（極速模式）
      const canJoin = meta && (meta.type === 'belongsTo' || meta.type === 'hasOne')
      if (p.strategy === 'join' || (p.strategy !== 'select' && canJoin)) {
        joinPreloads.push(p)
      } else {
        selectPreloads.push(p)
      }
    }

    const sourceTable = (this.modelClass as typeof BaseModel).getTableName()
    if (joinPreloads.length > 0) {
      // 確保主表欄位不被 JOIN 表欄位覆蓋
      const currentFields = (this.dbQuery as any).options.fields || ['*']
      const selectFields: string[] = currentFields.map((f: string) => (f === '*' ? `${sourceTable}.*` : f))

      for (const p of joinPreloads) {
        const meta = relations[p.relation]
        const TargetModel = meta.modelLoader()
        const targetTable = TargetModel.getTableName()
        const localKey = meta.foreignKey || (meta.type === 'belongsTo' ? `${TargetModel.name.replace(/Model$/i, '').toLowerCase()}_id` : (this.modelClass.primaryKey || 'id'))
        const foreignKey = meta.ownerKey || (meta.type === 'belongsTo' ? (TargetModel.primaryKey || 'id') : (meta.foreignKey || `${this.modelClass.name.replace(/Model$/i, '').toLowerCase()}_id`))

        let targetCols = TargetModel.getColumns ? await TargetModel.getColumns() : ['id', 'created_at', 'updated_at']
        if (p.callback) {
          const dummyQB = TargetModel.query()
          p.callback(dummyQB)
          const dummyFields = (dummyQB as any).dbQuery.options.fields
          if (dummyFields && dummyFields.length > 0 && dummyFields[0] !== '*') {
            targetCols = dummyFields
          }
        }

        for (const col of targetCols) {
          selectFields.push(`${targetTable}.${col} AS __rel_${p.relation}__${col}`)
        }

        this.dbQuery.leftJoin(
          targetTable,
          `${sourceTable}.${localKey}`,
          '=',
          `${targetTable}.${foreignKey}`,
          `__rel_${p.relation}__`
        )
      }

      this.dbQuery.select(...selectFields)
    }

    const rows = await this.dbQuery.all()

    const instances: Array<InstanceType<T>> = rows.map((r: any) => {
      const rowCopy = { ...r }
      const instance = new (this.modelClass as any)(rowCopy) as InstanceType<T>

      if (joinPreloads.length > 0) {
        for (const p of joinPreloads) {
          const prefix = `__rel_${p.relation}__`
          const relData: Record<string, any> = {}
          let hasVal = false
          for (const key of Object.keys(r)) {
            if (key.startsWith(prefix)) {
              const subKey = key.slice(prefix.length)
              const val = r[key]
              relData[subKey] = val
              delete (instance as any)[key]
              if (val !== null && val !== undefined) {
                hasVal = true
              }
            }
          }
          const meta = relations[p.relation]
          const TargetModel = meta.modelLoader()
          if (hasVal && relData[TargetModel.primaryKey || 'id'] !== null && relData[TargetModel.primaryKey || 'id'] !== undefined) {
            ;(instance as any)[p.relation] = new TargetModel(relData)
          } else {
            ;(instance as any)[p.relation] = null
          }
        }
      }

      return instance
    })

    if (instances.length > 0 && selectPreloads.length > 0) {
      await this.eagerLoad(instances, selectPreloads)
    }

    return instances
  }

  async exec(): Promise<Array<InstanceType<T>>> {
    return this.all()
  }

  /**
   * 批次更新符合條件的資料 (AdonisJS Lucid query.update(payload))
   * 自動維護 updated_at 時間戳，並回傳受影響筆數
   */
  async update(data: Record<string, any>): Promise<number> {
    const now = dateTime.now().toISO() || new Date().toISOString()
    const payload = { ...data, updated_at: data.updated_at || now }
    return await this.dbQuery.update(payload)
  }

  /**
   * 批次刪除符合條件的資料 (AdonisJS Lucid query.delete())
   * 回傳受影響筆數
   */
  async delete(): Promise<number> {
    return await this.dbQuery.delete()
  }

  /**
   * 透過查詢鏈寫入單筆或多筆資料 (AdonisJS Lucid query.insert(payload))
   */
  async insert(data: Record<string, any> | Array<Record<string, any>>): Promise<any> {
    return await this.dbQuery.insert(data)
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
  async eagerLoad(models: Array<InstanceType<T>>, preloadsToLoad: PreloadDefinition[] = this.preloads): Promise<void> {
    if (models.length === 0) return

    const relations = getModelRelations(this.modelClass)
    const primaryKey = (this.modelClass as any).primaryKey || 'id'

    for (const preloadDef of preloadsToLoad) {
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
