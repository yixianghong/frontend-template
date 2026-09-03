import { logger } from '../utils/logger'

/**
 * 存取日誌（access log）。
 *
 * ## 為什麼用 Nitro plugin 而不是 middleware
 * middleware 在**請求進來時**執行，那時還不知道回應的狀態碼與耗時。
 * Nitro 的 `afterResponse` hook 則在回應送出後才觸發，能拿到完整資訊。
 *
 * ## 輸出範例（production）
 * ```json
 * {"level":"info","time":"2026-08-26T10:30:00.000Z","service":"frontend-template",
 *  "requestId":"0f1c...","method":"GET","url":"/api/demo/list","statusCode":200,
 *  "durationMs":42,"msg":"request completed"}
 * ```
 *
 * ## 為什麼不記錄 request body
 * body 很可能含有密碼、個資、信用卡號。即使有 redact 設定，也難以窮舉所有欄位名。
 * 需要除錯時，請在特定端點內用 `event.context.logger.debug()` 記錄
 * **明確挑選過的**欄位，而不是整包倒出來。
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event) => {
    // 靜態資源與 HMR 請求量太大，記錄它們只會淹沒真正有價值的 log
    if (isNoiseRoute(event.path)) return

    const startTime = event.context.startTime
    const durationMs =
      typeof startTime === 'number' ? Math.round(performance.now() - startTime) : undefined
    const statusCode = event.node.res.statusCode
    const log = event.context.logger ?? logger

    const payload = {
      method: event.method,
      url: event.path,
      statusCode,
      durationMs,
      userAgent: event.node.req.headers['user-agent'],
      // 已登入時記錄使用者 ID，方便追查「某個使用者遇到什麼問題」
      userId: event.context.user?.id,
    }

    // 依狀態碼決定 log 等級：5xx 需要告警，4xx 是使用者問題，其餘正常
    if (statusCode >= 500) {
      log.error(payload, 'request failed')
    } else if (statusCode >= 400) {
      log.warn(payload, 'request rejected')
    } else {
      log.info(payload, 'request completed')
    }
  })
})

/** 判斷是否為不值得記錄的雜訊路由。 */
function isNoiseRoute(path: string): boolean {
  return (
    path.startsWith('/_nuxt/') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/_ipx/') ||
    path === '/favicon.ico' ||
    path === '/api/health'
  )
}
