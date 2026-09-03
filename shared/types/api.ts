import type { ErrorCode } from '../constants/error-codes'

/**
 * 全站統一的 API 回應格式。
 *
 * BFF（`server/api/**`）回傳的每一個 JSON 回應都必定是 `ApiSuccess` 或 `ApiFailure`
 * 其中之一 —— 包含 404、500、以及 middleware 拋出的錯誤，全部都會被
 * `server/utils/handler.ts` 與 `server/error.ts` 收斂成這個形狀。
 *
 * 前端因此永遠不需要寫「這個端點回傳什麼形狀」的防禦性程式碼。
 */

/** 分頁資訊。列表型端點請用 `apiPaginated()` 產生。 */
export interface Pagination {
  /** 目前頁碼，從 1 開始。 */
  page: number
  /** 每頁筆數。 */
  pageSize: number
  /** 符合條件的總筆數。 */
  total: number
  /** 總頁數，等於 `Math.ceil(total / pageSize)`。 */
  totalPages: number
  /** 是否還有下一頁，用於無限捲動。 */
  hasNext: boolean
}

/** 每個回應都會附帶的中繼資訊。 */
export interface ApiMeta {
  /**
   * 本次請求的唯一識別碼。
   * 同一個值會出現在 server log、回應 header `x-request-id`、以及錯誤畫面上，
   * 使用者回報問題時提供這組 ID 就能直接撈出完整的請求軌跡。
   */
  requestId: string
  /** 回應產生時間（ISO 8601）。 */
  timestamp: string
  /** 僅列表型端點會有。 */
  pagination?: Pagination
}

/** 成功回應。 */
export interface ApiSuccess<T = unknown> {
  success: true
  data: T
  meta: ApiMeta
}

/** 失敗回應。 */
export interface ApiFailure {
  success: false
  error: {
    /** 機器可讀的錯誤碼，前端據此決定行為（例如 401 就導向登入）。 */
    code: ErrorCode
    /** 人可讀的訊息，已在後端本地化，可直接顯示給使用者。 */
    message: string
    /**
     * 結構化的錯誤細節，例如 zod 的欄位錯誤清單。
     * production 環境下，非預期的內部錯誤不會帶出此欄位，避免洩漏實作細節。
     */
    details?: unknown
    /** 同 `ApiMeta.requestId`。 */
    requestId: string
    timestamp: string
  }
}

/** API 回應的聯集型別。可用 `success` 欄位做型別窄化。 */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure

/** 型別守衛：判斷回應是否成功，並窄化出 `data` 的型別。 */
export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.success === true
}

/** 分頁查詢的共用參數形狀。 */
export interface PaginationQuery {
  page?: number
  pageSize?: number
}
