import { defineEventHandler, setResponseStatus, type H3Event } from 'h3'
import { toAppError } from './errors'
import { apiFailure, apiSuccess } from './response'
import { logger as rootLogger } from './logger'
import type { ApiResponse } from '../../shared/types/api'

/**
 * 所有 `server/api/**` 端點的統一包裝器。
 *
 * ## 它做了三件事
 * 1. **統一成功格式**：handler 直接 `return` 資料即可，會自動包成
 *    `{ success: true, data, meta }`。若已經回傳我們的信封格式（例如用了
 *    `apiPaginated()`），則原樣通過，不會重複包裝。
 * 2. **統一錯誤格式**：捕捉 handler 內拋出的任何東西，正規化成 `AppError`，
 *    設定正確的 HTTP 狀態碼，回傳 `{ success: false, error: {...} }`。
 * 3. **統一錯誤日誌**：5xx 用 `error` 等級並記錄完整 stack；4xx 用 `warn` 等級
 *    （那是使用者的問題，不需要驚動 on-call）。
 *
 * ## 為什麼不直接用 h3 的 defineEventHandler
 * 因為需要保證「這個 API 不論成功失敗，回傳形狀永遠一致」。有了這層包裝，
 * 端點內部就可以放心地用 `throw new AppError(...)` 表達錯誤，不必層層回傳
 * 錯誤物件、也不必在每支端點重寫 try/catch。
 *
 * @example 最常見的寫法 —— 直接回傳資料
 * ```ts
 * // server/api/demo/[id].get.ts
 * export default defineApiHandler(async (event) => {
 *   const { id } = await validateParams(event, idParamSchema)
 *   const item = await upstreamFetch(event, `/items/${id}`)
 *   if (!item) throw new AppError(ERROR_CODE.NOT_FOUND, '找不到這筆資料')
 *   return item          // → { success: true, data: item, meta: {...} }
 * })
 * ```
 *
 * @example 需要分頁時 —— 明確使用 apiPaginated
 * ```ts
 * export default defineApiHandler(async (event) => {
 *   const { page, pageSize } = await validateQuery(event, paginationQuerySchema)
 *   const { items, total } = await listItems({ page, pageSize })
 *   return apiPaginated(event, items, { page, pageSize, total })
 * })
 * ```
 */
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return defineEventHandler(async (event): Promise<ApiResponse<T>> => {
    try {
      const result = await handler(event)

      // 已經是信封格式（apiSuccess / apiPaginated / apiFailure 的產物）就原樣通過，
      // 避免出現 data.data.data 這種俄羅斯娃娃。
      if (isEnvelope(result)) {
        return result as ApiResponse<T>
      }

      return apiSuccess(event, result)
    } catch (err) {
      const appError = toAppError(err)
      const log = event.context.logger ?? rootLogger

      if (appError.statusCode >= 500) {
        // 5xx 是我們的問題：記錄完整 stack 與原始 cause，方便追查。
        log.error(
          {
            err: appError,
            cause: appError.cause,
            code: appError.code,
            statusCode: appError.statusCode,
          },
          `unhandled error: ${appError.message}`,
        )
      } else {
        // 4xx 是使用者輸入問題：記 warn 就好，不要污染錯誤告警。
        log.warn(
          { code: appError.code, statusCode: appError.statusCode, details: appError.details },
          `client error: ${appError.message}`,
        )
      }

      setResponseStatus(event, appError.statusCode)
      return apiFailure(event, appError)
    }
  })
}

/** 判斷回傳值是否已經是我們的統一信封格式。 */
function isEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as { success: unknown }).success === 'boolean'
  )
}
