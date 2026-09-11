export type SchemaType = 'string' | 'number' | 'boolean' | 'enum'

export interface SchemaField<T = any> {
  type: SchemaType
  isOptional: boolean
  defaultValue?: T
  choices?: any[]
  validate(value: any, key: string): T
}

export type EnvSchema = Record<string, SchemaField<any>>

export type InferEnv<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends SchemaField<infer T> ? T : any
}

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const equalsIdx = line.indexOf('=')
    if (equalsIdx === -1) continue
    const key = line.slice(0, equalsIdx).trim()
    let val = line.slice(equalsIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    result[key] = val
  }
  return result
}

export class EnvStore<S extends EnvSchema = EnvSchema> {
  private runtimeEnv: Record<string, any> = {}
  private parsedFileEnv: Record<string, string> = {}
  private fileEnvLoaded = false

  constructor(public schema: S) {
    this.loadFileEnvs()
  }

  private loadFileEnvs() {
    if (this.fileEnvLoaded) return
    this.fileEnvLoaded = true

    // 在 Node.js / 本地執行環境中，自動嘗試解析 .dev.vars 與 .env
    try {
      if (typeof process !== 'undefined' && process.cwd) {
        const fs = typeof require !== 'undefined' ? require('fs') : null
        if (fs) {
          const cwd = process.cwd()
          const path = require('path')
          const devVarsPath = path.join(cwd, '.dev.vars')
          const envPath = path.join(cwd, '.env')

          if (fs.existsSync(devVarsPath)) {
            const parsed = parseDotEnv(fs.readFileSync(devVarsPath, 'utf-8'))
            Object.assign(this.parsedFileEnv, parsed)
          }
          if (fs.existsSync(envPath)) {
            const parsed = parseDotEnv(fs.readFileSync(envPath, 'utf-8'))
            // .dev.vars 優先權高於 .env
            this.parsedFileEnv = { ...parsed, ...this.parsedFileEnv }
          }
        }
      }
    } catch {
      // 忽略在純邊緣環境無法使用 fs 的情況
    }
  }

  /**
   * 設定由 Cloudflare Workers 傳入的每請求環境變數 (c.env)
   */
  public setRuntimeEnv(env: Record<string, any>) {
    if (env && typeof env === 'object') {
      this.runtimeEnv = { ...this.runtimeEnv, ...env }
    }
  }

  public getRuntimeEnv(): Record<string, any> {
    return this.runtimeEnv
  }

  /**
   * 取得環境變數值
   */
  public get<K extends keyof S>(key: K): InferEnv<S>[K]
  public get<T = any>(key: string, defaultValue?: T): T
  public get(key: string, defaultValue?: any): any {
    // 優先序：
    // 1. Cloudflare Workers c.env (runtimeEnv)
    // 2. Node process.env (若有)
    // 3. 本機解析的 .dev.vars / .env
    // 4. Schema 預設值
    // 5. 調用時傳入的 defaultValue
    let rawValue: any = undefined

    if (this.runtimeEnv[key] !== undefined) {
      rawValue = this.runtimeEnv[key]
    } else if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      rawValue = process.env[key]
    } else if (this.parsedFileEnv[key] !== undefined) {
      rawValue = this.parsedFileEnv[key]
    }

    const field = this.schema[key]
    if (field) {
      if (rawValue === undefined) {
        rawValue = field.defaultValue !== undefined ? field.defaultValue : defaultValue
      }
      if (rawValue !== undefined) {
        return field.validate(rawValue, key)
      }
      if (!field.isOptional && defaultValue === undefined) {
        console.warn(`[Env] 警告: 環境變數 ${key} 未設定且非可選欄位。`)
      }
      return defaultValue
    }

    return rawValue !== undefined ? rawValue : defaultValue
  }

  public all(): Record<string, any> {
    const result: Record<string, any> = {
      ...this.parsedFileEnv,
      ...(typeof process !== 'undefined' && process.env ? process.env : {}),
      ...this.runtimeEnv
    }
    return result
  }
}

export class Env {
  static schema = {
    string(options?: { default?: string }): SchemaField<string> & { optional(): SchemaField<string | undefined> } {
      const field: SchemaField<string> & { optional(): SchemaField<string | undefined> } = {
        type: 'string',
        isOptional: false,
        defaultValue: options?.default,
        validate(val: any) {
          if (val === undefined || val === null) return options?.default as string
          return String(val)
        },
        optional() {
          return {
            type: 'string',
            isOptional: true,
            defaultValue: options?.default,
            validate(val: any) {
              if (val === undefined || val === null || val === '') return options?.default
              return String(val)
            }
          }
        }
      }
      return field
    },

    number(options?: { default?: number }): SchemaField<number> & { optional(): SchemaField<number | undefined> } {
      const field: SchemaField<number> & { optional(): SchemaField<number | undefined> } = {
        type: 'number',
        isOptional: false,
        defaultValue: options?.default,
        validate(val: any, key: string) {
          if (val === undefined || val === null) return options?.default as number
          const parsed = Number(val)
          if (isNaN(parsed)) {
            throw new Error(`環境變數 ${key} 必須為合法數值，收到: ${val}`)
          }
          return parsed
        },
        optional() {
          return {
            type: 'number',
            isOptional: true,
            defaultValue: options?.default,
            validate(val: any, key: string) {
              if (val === undefined || val === null || val === '') return options?.default
              const parsed = Number(val)
              if (isNaN(parsed)) {
                throw new Error(`環境變數 ${key} 必須為合法數值，收到: ${val}`)
              }
              return parsed
            }
          }
        }
      }
      return field
    },

    boolean(options?: { default?: boolean }): SchemaField<boolean> & { optional(): SchemaField<boolean | undefined> } {
      const field: SchemaField<boolean> & { optional(): SchemaField<boolean | undefined> } = {
        type: 'boolean',
        isOptional: false,
        defaultValue: options?.default,
        validate(val: any) {
          if (val === undefined || val === null) return options?.default as boolean
          if (typeof val === 'boolean') return val
          const s = String(val).toLowerCase().trim()
          return s === 'true' || s === '1' || s === 'yes'
        },
        optional() {
          return {
            type: 'boolean',
            isOptional: true,
            defaultValue: options?.default,
            validate(val: any) {
              if (val === undefined || val === null || val === '') return options?.default
              if (typeof val === 'boolean') return val
              const s = String(val).toLowerCase().trim()
              return s === 'true' || s === '1' || s === 'yes'
            }
          }
        }
      }
      return field
    },

    enum<T extends readonly string[]>(choices: T, options?: { default?: T[number] }): SchemaField<T[number]> & { optional(): SchemaField<T[number] | undefined> } {
      const field: SchemaField<T[number]> & { optional(): SchemaField<T[number] | undefined> } = {
        type: 'enum',
        isOptional: false,
        defaultValue: options?.default,
        choices: choices as any,
        validate(val: any, key: string) {
          if (val === undefined || val === null) return options?.default as T[number]
          const str = String(val)
          if (!choices.includes(str as any)) {
            throw new Error(`環境變數 ${key} 的值 "${str}" 不在允許的選項 [${choices.join(', ')}] 中`)
          }
          return str as T[number]
        },
        optional() {
          return {
            type: 'enum',
            isOptional: true,
            defaultValue: options?.default,
            choices: choices as any,
            validate(val: any, key: string) {
              if (val === undefined || val === null || val === '') return options?.default
              const str = String(val)
              if (!choices.includes(str as any)) {
                throw new Error(`環境變數 ${key} 的值 "${str}" 不在允許的選項 [${choices.join(', ')}] 中`)
              }
              return str as T[number]
            }
          }
        }
      }
      return field
    }
  }

  static create<S extends EnvSchema>(schema: S): EnvStore<S> {
    return new EnvStore(schema)
  }
}
