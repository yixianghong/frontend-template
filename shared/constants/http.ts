/**
 * 前後端共用的 HTTP 常數。
 *
 * CSRF 的 cookie / header 名稱必須兩邊一致，所以放在 `shared/`：
 * BFF 用它驗證，前端的 `useApiClient` 用它讀取並帶上 header。
 */

/** 加密 session cookie 的名稱（httpOnly，前端 JS 讀不到）。 */
export const SESSION_COOKIE_NAME = 'app_session'

/**
 * CSRF token 的 cookie 名稱。
 * 這個 cookie **刻意不是 httpOnly** —— double-submit 機制需要前端 JS 讀得到它，
 * 才能把同一個值放進 request header 讓後端比對。
 */
export const CSRF_COOKIE_NAME = 'csrf_token'

/** 前端送出 CSRF token 時使用的 request header 名稱。 */
export const CSRF_HEADER_NAME = 'x-csrf-token'

/** 請求追蹤 ID 的 header 名稱，跨服務傳遞時沿用同一個值。 */
export const REQUEST_ID_HEADER = 'x-request-id'

/** 不需要 CSRF 驗證的安全方法（不會改變伺服器狀態）。 */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const
