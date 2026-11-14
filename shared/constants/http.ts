/**
 * 前後端共用的 HTTP 常數。
 *
 * CSRF header 名稱同時被 `nuxt.config.ts`（nuxt-csurf 設定）與 CORS 白名單使用，
 * 放在 `shared/` 讓兩邊不會各寫各的。
 */

/** 加密 session cookie 的名稱（httpOnly，前端 JS 讀不到）。 */
export const SESSION_COOKIE_NAME = 'app_session'

/** 前端送出 CSRF token 時使用的 request header 名稱（設定給 nuxt-csurf 的 `headerName`）。 */
export const CSRF_HEADER_NAME = 'x-csrf-token'

/** 請求追蹤 ID 的 header 名稱，跨服務傳遞時沿用同一個值。 */
export const REQUEST_ID_HEADER = 'x-request-id'

/** 不需要 CSRF 驗證的安全方法（不會改變伺服器狀態）。 */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const
