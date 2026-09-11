import type { HttpContext, NextFn } from '../../core/types'

export default class ApiFormatMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if ((ctx as any).__apiFormatted) {
      return await next()
    }
    ;(ctx as any).__apiFormatted = true

    const start: number = Date.now()
    try {
      await next()

      return ctx.response.status(200).json({
        code: [0],
        data: ctx.response.lazyBody?.content?.[0],
        time: Date.now() - start + ' ms',
      })
    } catch (error: any) {
      const errorPayload = error instanceof Error
        ? { ...error, message: error.message }
        : { ...(error as Record<string, any>) }

      return ctx.response.status(200).json({
        ...errorPayload,
        time: Date.now() - start + ' ms',
      })
    }
  }
}
