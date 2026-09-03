import { defineEventHandler, getCookie, getRequestHeader } from 'h3'
import { AppError, ERROR_CODE } from '../utils/errors'
import { getSessionCsrfToken } from '../utils/session'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SAFE_METHODS } from '../../shared/constants/http'

/**
 * CSRF 防護（double-submit cookie 模式）。
 *
 * ## 攻擊情境
 * 使用者登入我們的網站後，被誘導去瀏覽惡意網站。惡意網站送出一個指向
 * 我們 API 的表單，瀏覽器會**自動附上使用者的 session cookie** ——
 * 對伺服器來說，這看起來就是一個合法的已登入請求。
 *
 * ## 為什麼 SameSite 還不夠
 * session cookie 已經設了 `SameSite=Lax`，能擋掉絕大多數跨站請求。
 * 但它不是萬能的：
 * - 舊版瀏覽器不支援 SameSite
 * - 某些代理或瀏覽器擴充功能會影響 SameSite 判定
 * - `Lax` 仍允許跨站的**頂層 GET 導覽**帶上 cookie
 *
 * 縱深防禦（defense in depth）的原則是不依賴單一機制，所以再加一層。
 *
 * ## double-submit 的原理
 * ```
 * 登入時：server 產生隨機 token，同時寫入
 *   ① 加密 session（httpOnly，前端讀不到、也改不了）
 *   ② 一般 cookie（前端 JS 讀得到）
 *
 * 前端發請求：從 ② 讀出 token，放進 x-csrf-token header
 *
 * server 驗證：header 的值 === session ① 裡的值 ？
 * ```
 *
 * 惡意網站雖然能讓瀏覽器自動帶上 cookie，但因為**同源政策**，
 * 它讀不到我們網域的 cookie 內容，所以填不出正確的 header。
 *
 * 前端這一側由 `app/composables/useApiClient.ts` 自動處理，開發者不需要手動帶。
 */
export default defineEventHandler(async (event) => {
  // 只檢查 API 路由
  if (!event.path.startsWith('/api/')) return

  // 安全方法不改變伺服器狀態，不需要 CSRF 保護
  if (SAFE_METHODS.includes(event.method as (typeof SAFE_METHODS)[number])) return

  // 登入本身是「還沒有 session」的狀態，自然也還沒有 CSRF token。
  // 它的防護來自帳密驗證本身，加上 30.rate-limit 擋暴力破解。
  if (event.path === '/api/auth/login') return

  const sessionToken = await getSessionCsrfToken(event)

  // 沒有 session 的請求不需要 CSRF 檢查 —— CSRF 攻擊的前提就是「盜用既有登入狀態」，
  // 沒有登入狀態可盜就沒有攻擊面。是否需要登入由各端點的 requireUser() 決定。
  if (!sessionToken) return

  const headerToken = getRequestHeader(event, CSRF_HEADER_NAME)
  const cookieToken = getCookie(event, CSRF_COOKIE_NAME)

  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, sessionToken)) {
    event.context.logger?.warn(
      { path: event.path, method: event.method, hasHeader: Boolean(headerToken) },
      'CSRF validation failed',
    )
    throw new AppError(ERROR_CODE.CSRF_INVALID)
  }
})

/**
 * 定值時間字串比對。
 *
 * 一般的 `===` 會在第一個不同的字元就回傳，攻擊者可以藉由測量回應時間
 * 逐字元猜出正確的 token（timing attack）。這裡不論結果如何都比對完所有字元。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
