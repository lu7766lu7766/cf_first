import 'reflect-metadata'
import type { ControllerConstructor } from './types'

const INJECTABLE_KEY = Symbol('adonis:injectable')

export class Container {
  private static bindings = new Map<any, any>()
  private static singletons = new Map<any, any>()

  /**
   * 註冊常規工廠綁定
   */
  static bind<T>(key: string | symbol | ControllerConstructor<T>, factory: () => T): void {
    this.bindings.set(key, factory)
  }

  /**
   * 註冊單例
   */
  static singleton<T>(key: string | symbol | ControllerConstructor<T>, factory: () => T): void {
    this.singletons.set(key, factory)
  }

  /**
   * 解析並實例化依賴
   */
  static make<T>(target: ControllerConstructor<T> | string | symbol): T {
    // 檢查是否有單例
    if (this.singletons.has(target)) {
      const existing = this.singletons.get(target)
      if (typeof existing === 'function') {
        const instance = existing()
        this.singletons.set(target, instance)
        return instance
      }
      return existing
    }

    // 檢查是否有工廠綁定
    if (this.bindings.has(target)) {
      const factory = this.bindings.get(target)
      return factory()
    }

    // 若為 Class，透過反射遞迴解析建構子參數
    if (typeof target === 'function') {
      const paramTypes = Reflect.getMetadata('design:paramtypes', target) || []
      const resolvedParams = paramTypes.map((param: any) => this.make(param))
      return new (target as any)(...resolvedParams)
    }

    throw new Error(`[IoC Container] 無法解析依賴：${String(target)}`)
  }

  /**
   * 清除容器綁定（測試用）
   */
  static clear(): void {
    this.bindings.clear()
    this.singletons.clear()
  }
}

/**
 * @inject 裝飾器：標記 Class 可被 IoC Container 自動解析注入
 */
export function inject() {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    Reflect.defineMetadata(INJECTABLE_KEY, true, target)
    return target
  }
}
