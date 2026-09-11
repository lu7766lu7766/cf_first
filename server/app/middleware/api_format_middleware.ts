import type { HttpContext, NextFn } from '../../core/types'

export default class ApiFormatMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
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
        ? { message: error.message, ...error }
        : { ...(error as Record<string, any>) }

      return ctx.response.status(200).json({
        ...errorPayload,
        time: Date.now() - start + ' ms',
      })
    }
  }
}
