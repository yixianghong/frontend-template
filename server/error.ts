import {
  getResponseHeader,
  send,
  setResponseHeaders,
  setResponseStatus,
  type H3Error,
  type H3Event,
} from 'h3'
import { toAppError } from './utils/errors'
import { apiFailure } from './utils/response'
import { logger as rootLogger } from './utils/logger'

/**
 * Nitro 全域錯誤兜底（掛在 `nuxt.config.ts` 的 `nitro.errorHandler`）。
 *
 * ## 為什麼需要「第二層」
 * `defineApiHandler` 已經把端點內部拋出的錯誤都接住了，但有些錯誤發生在
 * 它管轄範圍之外：
 * - **404**：根本沒有匹配到任何路由，handler 不會被執行
 * - **middleware 拋錯**：例如 rate limit 的 429、CSRF 的 403
 * - **框架層錯誤**：body 解析失敗、路由參數解碼失敗
 *
 * 這些如果不處理，Nitro 預設會回傳它自己的格式
 * （`{ error: true, statusCode, statusMessage, ... }`），前端就會遇到
 * 「有時候是我們的格式、有時候是 Nitro 的格式」的不一致問題。
 *
 * ## 為什麼不能用 beforeResponse hook 做這件事
 * 在 h3 v1 的流程中，`onError` 會先被呼叫並**直接送出回應**，
 * 之後才輪到 `onBeforeResponse`。那時 body 已經寫出去了，改也沒用。
 * 所以覆寫 `errorHandler` 是唯一能改寫錯誤回應內容的切入點。
 *
 * ## 分流原則
 * - `/api/*` → 統一的 JSON 錯誤信封
 * - 其他路徑 → 沿用 Nitro 的預設行為（頁面的錯誤畫面由 Nuxt 的
 *   `app/error.vue` 在 SSR 階段就處理掉了，不會走到這裡）
 */
export default async function errorHandler(error: H3Error, event: H3Event): Promise<void> {
  const statusCode = error.statusCode || 500
  const log = event.context.logger ?? rootLogger
  const requestId = event.context.requestId ?? 'unknown'

  // 「unhandled / fatal」代表這是我們沒預期到的錯誤，需要完整記錄
  const isUnexpected = Boolean(error.unhandled || error.fatal) || statusCode >= 500

  if (isUnexpected) {
    log.error(
      { err: error, statusCode, url: event.path, method: event.method },
      'unhandled error reached global error handler',
    )
  } else {
    log.warn(
      { statusCode, url: event.path, method: event.method, message: error.message },
      'client error reached global error handler',
    )
  }

  // --- API 路由：回傳統一 JSON 信封 ---
  if (event.path.startsWith('/api/')) {
    const appError = toAppError(error)
    const body = apiFailure(event, appError, { requestId })

    setResponseStatus(event, appError.statusCode)
    setResponseHeaders(event, {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      // 錯誤回應絕不快取，否則使用者會一直看到同一個錯誤
      'cache-control': 'no-store',
    })
    await send(event, JSON.stringify(body))
    return
  }

  // --- 非 API 路由：維持 Nitro 預設格式 ---
  // 正常情況下頁面錯誤會由 Nuxt 的 error.vue 在 SSR 階段渲染，走不到這裡；
  // 會落到這裡的是 SSR 本身崩潰之類的極端狀況。
  setResponseStatus(event, statusCode, error.statusMessage || 'Server Error')
  setResponseHeaders(event, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    // 錯誤頁面不應執行任何 JS，也不可被嵌入
    'content-security-policy': "script-src 'none'; frame-ancestors 'none';",
  })
  if (!getResponseHeader(event, 'cache-control')) {
    setResponseHeaders(event, { 'cache-control': 'no-cache' })
  }

  await send(
    event,
    JSON.stringify(
      {
        success: false,
        error: {
          code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
          // 5xx 不對外揭露真實訊息
          message: isUnexpected ? '系統發生錯誤，請稍後再試' : error.message,
          requestId,
          timestamp: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  )
}
