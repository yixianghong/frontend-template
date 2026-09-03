import { defineEventHandler, removeResponseHeader, setResponseHeaders } from 'h3'

/**
 * 基礎資安回應標頭。
 *
 * 這些 header 是「零成本」的防護：不影響效能、不改變業務邏輯，
 * 但能擋掉大量常見攻擊。逐條說明如下。
 *
 * > 想要更完整的方案（含 nonce-based CSP、CSRF、跨域隔離）可以改用
 * > `nuxt-security` 模組。這裡自己實作是為了讓每一條規則都攤開可見、
 * > 方便各專案依需求增刪，不必去猜模組的預設值是什麼。
 */

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Content-Security-Policy。
 *
 * ⚠️ 這裡的 `script-src` 含 `'unsafe-inline'`，原因是 Nuxt 的 SSR payload
 * （hydration 資料）是以 inline script 注入的。要拿掉它需要 nonce 機制，
 * 那需要在 SSR 渲染時把 nonce 注入每個 script 標籤 —— 建議直接用
 * `nuxt-security` 模組處理，而不是自己接。
 *
 * 若你的專案是純靜態內容站、不需要 hydration，可以直接移除 `'unsafe-inline'`
 * 取得更強的 XSS 防護。
 */
function buildCsp(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 限制 <base> 標籤，避免攻擊者改寫相對路徑的解析基準
    'base-uri': ["'self'"],
    // 禁止 <object>/<embed>，這類老舊標籤是常見的 XSS 載體
    'object-src': ["'none'"],
    // 禁止本站被任何頁面嵌入 iframe —— 防點擊劫持（clickjacking）
    'frame-ancestors': ["'none'"],
    // 表單只能送往本站，防止釣魚頁面把表單導到外部
    'form-action': ["'self'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    // 前端只允許連回自己（也就是只能打 BFF），不能直接連外部 API
    'connect-src': ["'self'"],
  }

  if (!isProduction) {
    // Vite dev server 需要 eval 與 websocket 熱更新
    directives['script-src']!.push("'unsafe-eval'")
    directives['connect-src']!.push('ws:', 'wss:')
  }

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')

  // 正式環境把所有 http 子資源自動升級成 https
  return isProduction ? `${policy}; upgrade-insecure-requests` : policy
}

const CSP = buildCsp()

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Security-Policy': CSP,

    // 禁止瀏覽器「猜」內容型別。可防止把上傳的圖片當成 script 執行。
    'X-Content-Type-Options': 'nosniff',

    // 舊瀏覽器的點擊劫持防護（新瀏覽器看 CSP frame-ancestors）
    'X-Frame-Options': 'DENY',

    // 跨站導覽時只送出來源網域，不洩漏完整路徑與 query（可能含敏感參數）
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // 預設關閉高風險裝置權限。專案若需要相機或定位再逐項開啟。
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',

    // 跨來源隔離：限制其他網站對本站資源的讀取與參照
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })

  if (isProduction) {
    // HSTS：告訴瀏覽器往後一年內只用 HTTPS 連本站，防降級與中間人攻擊。
    // 只在正式環境送出 —— 在 localhost 送會讓瀏覽器把 http://localhost 也強制轉 https。
    setResponseHeaders(event, {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    })
  }

  // 不要告訴攻擊者我們用什麼技術棧
  removeResponseHeader(event, 'x-powered-by')
})
