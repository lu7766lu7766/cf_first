import type { QueryBuilder } from './database'

export type RelationType = 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany'

export interface RelationOptions {
  foreignKey?: string
  localKey?: string
  ownerKey?: string
  pivotTable?: string
  pivotForeignKey?: string
  relatedForeignKey?: string
  relatedKey?: string
}

export interface RelationMeta extends RelationOptions {
  type: RelationType
  name: string
  modelLoader: () => any
}

export const RELATIONS_METADATA_KEY = Symbol.for('adonis:relations')

export function getModelRelations(modelClass: any): Record<string, RelationMeta> {
  if (!modelClass) return {}
  return modelClass[RELATIONS_METADATA_KEY] || {}
}

export function defineRelation(target: any, propName: string, meta: RelationMeta) {
  const ctor = typeof target === 'function' ? target : (target?.constructor || target)
  if (!ctor) return
  if (!ctor[RELATIONS_METADATA_KEY]) {
    ctor[RELATIONS_METADATA_KEY] = {}
  }
  ctor[RELATIONS_METADATA_KEY][propName] = meta
}

function createRelationDecorator(type: RelationType, modelLoader: () => any, options: RelationOptions = {}) {
  return function (targetOrValue: any, contextOrProp: any) {
    if (typeof contextOrProp === 'object' && contextOrProp !== null && 'name' in contextOrProp) {
      // Stage 3 裝飾器標準 (TypeScript 5+)
      const propName = String(contextOrProp.name)
      if (typeof contextOrProp.addInitializer === 'function') {
        contextOrProp.addInitializer(function (this: any) {
          defineRelation(this.constructor, propName, {
            type,
            name: propName,
            modelLoader,
            ...options
          })
        })
      }
      return targetOrValue
    } else {
      // Legacy 裝飾器標準
      const propName = String(contextOrProp)
      const ctor = targetOrValue?.constructor || targetOrValue
      defineRelation(ctor, propName, {
        type,
        name: propName,
        modelLoader,
        ...options
      })
    }
  }
}

/**
 * 宣告 hasOne 一對一關聯
 */
export function hasOne(modelLoader: () => any, options: { foreignKey?: string; localKey?: string } = {}) {
  return createRelationDecorator('hasOne', modelLoader, options)
}

/**
 * 宣告 hasMany 一對多關聯
 */
export function hasMany(modelLoader: () => any, options: { foreignKey?: string; localKey?: string } = {}) {
  return createRelationDecorator('hasMany', modelLoader, options)
}

/**
 * 宣告 belongsTo 多對一反向關聯
 */
export function belongsTo(modelLoader: () => any, options: { foreignKey?: string; ownerKey?: string } = {}) {
  return createRelationDecorator('belongsTo', modelLoader, options)
}

/**
 * 宣告 manyToMany 多對多關聯
 */
export function manyToMany(
  modelLoader: () => any,
  options: {
    pivotTable?: string
    localKey?: string
    pivotForeignKey?: string
    relatedForeignKey?: string
    relatedKey?: string
  } = {}
) {
  return createRelationDecorator('manyToMany', modelLoader, options)
}

/**
 * TypeScript 關聯型別標註
 */
export type HasOne<T> = T | null
export type HasMany<T> = T[]
export type BelongsTo<T> = T | null
export type ManyToMany<T> = T[]

/**
 * 關聯查詢客戶端介面
 */
export class RelationClient<T = any> {
  constructor(private model: any, private meta: RelationMeta) {}

  private getDefaultForeignKey(modelClass: any): string {
    const name = modelClass.name.replace(/Model$/i, '').toLowerCase()
    return `${name}_id`
  }

  query(): QueryBuilder<T> {
    const TargetModel = this.meta.modelLoader()
    const SourceModel = this.model.constructor
    const localKey = this.meta.localKey || SourceModel.primaryKey || 'id'
    const targetPrimaryKey = TargetModel.primaryKey || 'id'

    switch (this.meta.type) {
      case 'hasOne':
      case 'hasMany': {
        const foreignKey = this.meta.foreignKey || this.getDefaultForeignKey(SourceModel)
        const localValue = this.model[localKey]
        return TargetModel.query().where(foreignKey, localValue)
      }

      case 'belongsTo': {
        const foreignKey = this.meta.foreignKey || this.getDefaultForeignKey(TargetModel)
        const foreignValue = this.model[foreignKey]
        const ownerKey = this.meta.ownerKey || targetPrimaryKey
        return TargetModel.query().where(ownerKey, foreignValue)
      }

      case 'manyToMany': {
        const pivotTable = this.meta.pivotTable || [SourceModel.getTableName(), TargetModel.getTableName()].sort().join('_')
        const pivotSourceKey = this.meta.pivotForeignKey || this.getDefaultForeignKey(SourceModel)
        const pivotTargetKey = this.meta.relatedForeignKey || this.getDefaultForeignKey(TargetModel)
        const localValue = this.model[localKey]

        const targetTable = TargetModel.getTableName()
        return TargetModel.query().whereIn(
          `${targetTable}.${targetPrimaryKey}`,
          DatabasePivotSubQuery(pivotTable, pivotTargetKey, pivotSourceKey, localValue)
        )
      }
    }
  }

  async get(callback?: (query: QueryBuilder<T>) => void): Promise<any> {
    const q = this.query()
    if (callback) {
      callback(q)
    }
    if (this.meta.type === 'hasOne' || this.meta.type === 'belongsTo') {
      const row = await q.first()
      return row ? new (this.meta.modelLoader())(row) : null
    }
    const rows = await q.all()
    const TargetModel = this.meta.modelLoader()
    return rows.map((r: any) => new TargetModel(r))
  }
}

function DatabasePivotSubQuery(pivotTable: string, targetKey: string, sourceKey: string, sourceValue: any) {
  return []
}
