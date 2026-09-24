import { BaseController } from '../../core/controller'
import type { HttpContext } from '../../core/types'
import { HttpException } from '../../core/exception_handler'
import { AiUsageLog } from '../models/ai_usage_log'

export default class AiController extends BaseController {
  private defaultModel = '@cf/meta/llama-3.1-8b-instruct-fast'

  /**
   * 調用 Cloudflare Workers AI 生成文字
   */
  async generate(ctx: HttpContext) {
    const body = await ctx.request.body()
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const model = (typeof body.model === 'string' && body.model.trim()) ? body.model.trim() : this.defaultModel
    const systemPrompt = typeof body.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : 'You are a helpful, knowledgeable AI assistant. Please respond politely and clearly in Traditional Chinese (繁體中文) unless requested otherwise.'

    if (!prompt) {
      throw new HttpException('提示詞 (prompt) 不得為空，請輸入欲詢問的問題或內容', 422, 'E_VALIDATION_ERROR')
    }

    // 1. 統計調用配額與限制 (每日預設 100 次)
    const dailyLimit = Number(ctx.env.AI_DAILY_LIMIT || 100)
    const todayStr = ctx.time.now().toFormat('yyyy-MM-dd')
    const allLogs = await AiUsageLog.all()

    const todayLogs = allLogs.filter((log) => {
      const createdStr = typeof log.created_at === 'string'
        ? log.created_at
        : (log.created_at?.toISO?.() || String(log.created_at || ''))
      return createdStr.startsWith(todayStr)
    })

    const todayCalls = todayLogs.length
    const totalCalls = allLogs.length

    if (todayCalls >= dailyLimit) {
      throw new HttpException(
        `今日 Cloudflare Workers AI 調用次數已達上限 (${dailyLimit} 次/日)，請明日重置後再試或提升配額。`,
        429,
        'E_AI_QUOTA_EXCEEDED'
      )
    }

    // 2. 執行 AI 模型推論
    const startTime = Date.now()
    let aiResultText = ''
    let isMock = 0
    let tokensUsed = 0

    if (ctx.env.AI && typeof ctx.env.AI.run === 'function') {
      try {
        const aiResponse = await ctx.env.AI.run(model, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })

        if (aiResponse && typeof aiResponse === 'object') {
          aiResultText = aiResponse.response || aiResponse.text || JSON.stringify(aiResponse)
          if (aiResponse.usage?.total_tokens) {
            tokensUsed = aiResponse.usage.total_tokens
          }
        } else if (typeof aiResponse === 'string') {
          aiResultText = aiResponse
        } else {
          aiResultText = String(aiResponse)
        }
      } catch (err: any) {
        console.warn(`[Workers AI] 呼叫 Cloudflare AI 失敗，切換至本機備援回應: ${err?.message || err}`)
        isMock = 1
        aiResultText = this.generateFallbackResponse(prompt, model, err?.message)
      }
    } else {
      isMock = 1
      aiResultText = this.generateFallbackResponse(prompt, model, '未偵測到 Cloudflare AI 雲端綁定環境變數 (env.AI)')
    }

    const durationMs = Date.now() - startTime
    if (!tokensUsed) {
      tokensUsed = Math.ceil((prompt.length + aiResultText.length) / 3)
    }

    // 3. 記錄至資料庫
    let savedLog: any = null
    try {
      savedLog = await AiUsageLog.create({
        user_id: ctx.auth?.user?.id || null,
        model,
        prompt: prompt.slice(0, 4000),
        response: aiResultText.slice(0, 10000),
        tokens_used: tokensUsed,
        duration_ms: durationMs,
        is_mock: isMock,
        status: 'success'
      })
    } catch (dbErr) {
      console.warn(`[Workers AI] 寫入調用日誌失敗:`, dbErr)
    }

    const newTodayCalls = todayCalls + 1
    const newTotalCalls = totalCalls + 1
    const newRemainingCalls = Math.max(0, dailyLimit - newTodayCalls)

    return {
      result: aiResultText,
      model,
      duration_ms: durationMs,
      tokens_used: tokensUsed,
      is_mock: isMock === 1,
      usage: {
        today_calls: newTodayCalls,
        total_calls: newTotalCalls,
        daily_limit: dailyLimit,
        remaining_calls: newRemainingCalls
      },
      log_id: savedLog?.id || null
    }
  }

  /**
   * 取得 Workers AI 調用額度與統計資訊
   */
  async usage(ctx: HttpContext) {
    const dailyLimit = Number(ctx.env.AI_DAILY_LIMIT || 100)
    const todayStr = ctx.time.now().toFormat('yyyy-MM-dd')
    const allLogs = await AiUsageLog.all()

    const todayLogs = allLogs.filter((log) => {
      const createdStr = typeof log.created_at === 'string'
        ? log.created_at
        : (log.created_at?.toISO?.() || String(log.created_at || ''))
      return createdStr.startsWith(todayStr)
    })

    const todayCalls = todayLogs.length
    const totalCalls = allLogs.length
    const remainingCalls = Math.max(0, dailyLimit - todayCalls)

    // 取最近 15 筆記錄，按 id 倒序
    const recentLogs = [...allLogs]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .slice(0, 15)
      .map((item) => ({
        id: item.id,
        model: item.model,
        prompt: item.prompt,
        response: item.response,
        tokens_used: item.tokens_used,
        duration_ms: item.duration_ms,
        is_mock: item.is_mock === 1,
        created_at: typeof item.created_at === 'string'
          ? item.created_at
          : (item.created_at?.toISO?.() || String(item.created_at || ''))
      }))

    return {
      today_calls: todayCalls,
      total_calls: totalCalls,
      daily_limit: dailyLimit,
      remaining_calls: remainingCalls,
      reset_time: `${todayStr} 23:59:59`,
      recent_logs: recentLogs
    }
  }

  /**
   * 本機開發/無網路/離線時之智慧模擬回應
   */
  private generateFallbackResponse(prompt: string, model: string, note?: string): string {
    const cleanPrompt = prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt
    return `【Cloudflare Workers AI 模擬回應】
模型: ${model}
您詢問的內容：「${cleanPrompt}」

已成功觸發 Workers AI API 調用管線！
${note ? `(系統狀態提示: ${note})\n` : ''}
在已部署的 Cloudflare Workers 邊緣網路或啟動 \`wrangler dev --remote\` 時，請求將直接於 Cloudflare 全球 GPU 運算叢集上進行極速推論。當前日誌與配額已即時記入 SQLite / D1 資料庫。`
  }
}
