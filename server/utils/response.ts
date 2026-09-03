import type { H3Event } from 'h3'
import type { ApiFailure, ApiSuccess, Pagination } from '../../shared/types/api'
import type { AppError } from './errors'

/**
 * 統一回應格式的建構工具。
 *
 * BFF 的每個端點都應該用這裡的函式產生回傳值，不要自己拼 `{ ... }`，
 * 這樣 `meta.requestId` 與 `timestamp` 才不會漏掉。
 */

/** 從 request context 取出 requestId（由 `00.request-context.ts` 注入）。 */
function requestIdOf(event: H3Event): string {
  return event.context.requestId ?? 'unknown'
}

/**
 * 產生成功回應。
 *
 * @example
 * ```ts
 * export default defineApiHandler(async (event) => {
 *   const user = await fetchUser(event)
 *   return apiSuccess(event, user)
 * })
 * // → { success: true, data: {...}, meta: { requestId, timestamp } }
 * ```
 */
export function apiSuccess<T>(event: H3Event, data: T): ApiSuccess<T> {
  return {
    success: true,
    data,
    meta: {
      requestId: requestIdOf(event),
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * 產生帶分頁資訊的成功回應。
 *
 * `totalPages` 與 `hasNext` 由 total/pageSize 自動算出，避免每個端點各算一次還算錯。
 *
 * @example
 * ```ts
 * const { page, pageSize } = await validateQuery(event, paginationQuerySchema)
 * const { items, total } = await upstream.list({ page, pageSize })
 * return apiPaginated(event, items, { page, pageSize, total })
 * ```
 */
export function apiPaginated<T>(
  event: H3Event,
  items: T[],
  opts: { page: number; pageSize: number; total: number },
): ApiSuccess<T[]> {
  const totalPages = opts.pageSize > 0 ? Math.ceil(opts.total / opts.pageSize) : 0
  const pagination: Pagination = {
    page: opts.page,
    pageSize: opts.pageSize,
    total: opts.total,
    totalPages,
    hasNext: opts.page < totalPages,
  }

  return {
    success: true,
    data: items,
    meta: {
      requestId: requestIdOf(event),
      timestamp: new Date().toISOString(),
      pagination,
    },
  }
}

/**
 * 由 `AppError` 產生失敗回應的 body。
 *
 * 一般情況下你不需要直接呼叫它 —— `defineApiHandler` 與 `server/error.ts`
 * 會自動處理。只有在需要「回 200 但內容是失敗語意」的特殊場景才會手動使用。
 *
 * 安全性：`expose === false`（也就是 5xx）時，訊息會被換成泛用文案、
 * `details` 一律不輸出，避免內部實作細節外洩。
 */
export function apiFailure(
  event: H3Event,
  error: AppError,
  opts: { requestId?: string } = {},
): ApiFailure {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.expose ? error.message : defaultSafeMessage(error),
      // 只有可揭露的錯誤才帶 details（例如 zod 的欄位錯誤清單）
      ...(error.expose && error.details !== undefined ? { details: error.details } : {}),
      requestId: opts.requestId ?? requestIdOf(event),
      timestamp: new Date().toISOString(),
    },
  }
}

/** 不可揭露的錯誤對外使用的泛用訊息。 */
function defaultSafeMessage(error: AppError): string {
  return error.statusCode >= 500 ? '系統發生錯誤，請稍後再試' : '請求無法處理'
}
