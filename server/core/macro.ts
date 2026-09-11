export class MacroManager {
  private static responseMacros = new Map<string, Function>()
  private static requestMacros = new Map<string, Function>()
  private static contextMacros = new Map<string, Function>()

  static macroResponse(name: string, fn: Function) {
    this.responseMacros.set(name, fn)
  }

  static macroRequest(name: string, fn: Function) {
    this.requestMacros.set(name, fn)
  }

  static macroContext(name: string, fn: Function) {
    this.contextMacros.set(name, fn)
  }

  static applyResponseMacros(target: any) {
    for (const [name, fn] of this.responseMacros.entries()) {
      target[name] = fn.bind(target)
    }
  }

  static applyRequestMacros(target: any) {
    for (const [name, fn] of this.requestMacros.entries()) {
      target[name] = fn.bind(target)
    }
  }

  static applyContextMacros(target: any) {
    for (const [name, fn] of this.contextMacros.entries()) {
      target[name] = fn.bind(target)
    }
  }
}

export const ResponseMacro = {
  macro(name: string, fn: Function) {
    MacroManager.macroResponse(name, fn)
  }
}

export const RequestMacro = {
  macro(name: string, fn: Function) {
    MacroManager.macroRequest(name, fn)
  }
}

export const ContextMacro = {
  macro(name: string, fn: Function) {
    MacroManager.macroContext(name, fn)
  }
}
