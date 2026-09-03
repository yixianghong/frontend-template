import { defineEventHandler, getRequestHeader, setResponseHeaders, setResponseStatus } from 'h3'
import { CSRF_HEADER_NAME, REQUEST_ID_HEADER } from '../../shared/constants/http'

/**
 * CORS 白名單。
 *
 * ## 這個樣板的預設立場：不開放跨域
 * 前端與 BFF 是同一個 Nuxt 服務、同一個網域，所以 API 呼叫本來就是同源的，
 * 完全不需要 CORS。`corsOrigins` 預設留空 = 不送任何 CORS header =
 * 瀏覽器阻擋所有跨域請求，這是最安全的預設值。
 *
 * ## 什麼時候需要設定
 * 只有在「BFF 要服務別的網域的前端」時才需要，例如手機 App 的 WebView、
 * 或另一個獨立部署的管理後台。此時在 `.env` 設定：
 *
 * ```
 * NUXT_CORS_ORIGINS=https://admin.example.com,https://app.example.com
 * ```
 *
 * ## 絕對不要用 `*`
 * 本 BFF 使用 cookie 認證，而 `Access-Control-Allow-Origin: *` 與
 * `Access-Control-Allow-Credentials: true` 在規範上互斥，瀏覽器會直接拒絕。
 * 更重要的是，通配符等於允許任何網站代表已登入使用者發請求。
 * 所以這裡只做**逐一比對的白名單**。
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const allowedOrigins = parseOrigins(config.corsOrigins)

  // 未設定白名單 → 維持純同源，不送任何 CORS header
  if (allowedOrigins.length === 0) return

  const origin = getRequestHeader(event, 'origin')
  if (!origin || !allowedOrigins.includes(origin)) return

  setResponseHeaders(event, {
    // 回傳「請求的那個 origin」而非白名單全文，這是規範要求的做法
    'Access-Control-Allow-Origin': origin,
    // 允許瀏覽器帶上 session cookie
    'Access-Control-Allow-Credentials': 'true',
    // 告訴快取層：回應內容會依 Origin 而異，不可跨 origin 共用快取
    Vary: 'Origin',
    'Access-Control-Expose-Headers': REQUEST_ID_HEADER,
  })

  // 處理 preflight：直接回 204，不要讓它繼續往下走到路由
  if (event.method === 'OPTIONS') {
    setResponseHeaders(event, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': `Content-Type,${CSRF_HEADER_NAME},${REQUEST_ID_HEADER}`,
      // 快取 preflight 結果 24 小時，減少往返
      'Access-Control-Max-Age': '86400',
    })
    setResponseStatus(event, 204)
    return ''
  }
})

/** 解析逗號分隔的來源清單，去除空白與空項。 */
function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
