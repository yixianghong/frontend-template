import type { ApiFailure } from '#shared/types/api'
import type { ErrorCode } from '#shared/constants/error-codes'

/**
 * 前端統一的 API 錯誤物件。
 *
 * BFF 保證所有失敗回應都是 `ApiFailure` 格式，這個類別就是它在前端的對應物。
 * 不論錯誤來自哪一層（驗證失敗、未登入、上游掛掉、網路斷線），前端接到的
 * 永遠是 `ApiError`，只要看 `code` 就能決定怎麼處理。
 *
 * 這個檔案在 `app/utils/` 底下，Nuxt 會自動匯入，不需要手動 import。
 *
 * @example 依錯誤碼分流處理
 * ```vue
 * <script setup lang="ts">
 * const { post, error } = useApi()
 *
 * async function submit() {
 *   try {
 *     await post('/orders', form.value)
 *   } catch (err) {
 *     const apiError = ApiError.from(err)
 *     if (apiError.code === 'UNAUTHORIZED') return navigateTo('/login')
 *     if (apiError.code === 'VALIDATION_ERROR') return showFieldErrors(apiError.fieldErrors)
 *     showToast(apiError.message)
 *   }
 * }
 * </script>
 * ```
 */
export class ApiError extends Error {
  /** 機器可讀的錯誤碼，來自 `shared/constants/error-codes.ts`。 */
  readonly code: ErrorCode
  /** HTTP 狀態碼。網路層錯誤（連不上伺服器）時為 0。 */
  readonly statusCode: number
  /** 結構化細節。驗證錯誤時會是 `{ fieldErrors, formErrors }`。 */
  readonly details?: unknown
  /** 對應 server log 的追蹤 ID，回報問題時提供它。 */
  readonly requestId: string

  constructor(init: {
    code: ErrorCode
    message: string
    statusCode: number
    details?: unknown
    requestId?: string
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.statusCode = init.statusCode
    this.details = init.details
    this.requestId = init.requestId ?? 'unknown'
  }

  /**
   * 取出 zod 驗證錯誤的欄位對應表，方便直接標紅表單欄位。
   *
   * @example
   * ```ts
   * const errors = apiError.fieldErrors   // { email: ['格式不正確'] }
   * ```
   */
  get fieldErrors(): Record<string, string[]> {
    if (
      this.details &&
      typeof this.details === 'object' &&
      'fieldErrors' in this.details &&
      typeof this.details.fieldErrors === 'object'
    ) {
      return (this.details.fieldErrors ?? {}) as Record<string, string[]>
    }
    return {}
  }

  /** 是否為「重新登入就能解決」的錯誤。 */
  get isAuthError(): boolean {
    return this.code === 'UNAUTHORIZED'
  }

  /** 是否值得重試（暫時性錯誤）。 */
  get isRetryable(): boolean {
    return (
      this.statusCode === 0 || // 網路錯誤
      this.statusCode === 429 ||
      this.statusCode >= 500
    )
  }

  /**
   * 把任何 thrown 的東西轉成 `ApiError`。
   *
   * 已經是 `ApiError` 就原樣返回；其他情況（網路斷線、JSON 壞掉、
   * 程式碼自己丟的 Error）一律轉成可顯示的錯誤物件，
   * 確保 UI 層永遠拿得到 `message` 可以顯示。
   */
  static from(err: unknown): ApiError {
    if (err instanceof ApiError) return err

    // Nuxt 的 useAsyncData / useFetch 會把錯誤用 createError() 包成 NuxtError，
    // 原始的 ApiError 會被放進 cause。這裡把它拆回來。
    if (err && typeof err === 'object' && 'cause' in err && err.cause instanceof ApiError) {
      return err.cause
    }

    // ofetch 的 FetchError：response 存在代表有連上伺服器
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { status?: number; _data?: unknown } }).response
      const body = response?._data
      if (isApiFailure(body)) return ApiError.fromFailure(body, response?.status ?? 500)
    }

    // 連不上伺服器（離線、DNS 失敗、CORS 被擋）
    return new ApiError({
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : '網路連線發生問題，請檢查連線後再試',
      statusCode: 0,
    })
  }

  /** 由 BFF 回傳的 `ApiFailure` body 建立錯誤物件。 */
  static fromFailure(failure: ApiFailure, statusCode: number): ApiError {
    return new ApiError({
      code: failure.error.code,
      message: failure.error.message,
      statusCode,
      details: failure.error.details,
      requestId: failure.error.requestId,
    })
  }
}

/** 判斷回應 body 是否為 BFF 的標準錯誤格式。 */
export function isApiFailure(value: unknown): value is ApiFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false &&
    'error' in value
  )
}
