import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SAFE_METHODS } from '#shared/constants/http'
import { ApiError, isApiFailure } from '~/utils/api-error'

/**
 * API 客戶端底層 —— `useApi()` 與 `useApiFetch()` 共用的 `$fetch` 實例。
 *
 * ## 你多半不需要直接用它
 * 日常開發請用上層的兩個 composable（見它們各自的說明）：
 * - `useApiFetch()`：宣告式，頁面載入時取資料，SSR 友善
 * - `useApi()`：命令式，使用者操作時才發送
 *
 * 只有在需要完整回應信封（例如要讀 `meta.requestId`）或要串接
 * 非標準行為時，才直接用這一層。
 *
 * ## 它幫你處理掉的四件事
 *
 * ### 1. SSR 的 Cookie 轉發（最常見的坑）
 * SSR 期間，程式碼跑在 Node 上，`$fetch('/api/auth/me')` 是 **Node 打 Node**，
 * 不經過瀏覽器，所以**不會自動帶上使用者的 cookie**。
 * 結果就是：畫面在伺服器端渲染成「未登入」，到了瀏覽器 hydration 後才變成
 * 「已登入」，造成畫面閃動，SEO 也拿不到正確內容。
 *
 * 這裡用 `useRequestHeaders(['cookie'])` 把瀏覽器送來的 cookie 原封轉發給 BFF，
 * SSR 就能取得正確的登入狀態。
 *
 * ### 2. CSRF Token 自動附加
 * 從前端可讀的 `csrf_token` cookie 取值，放進 `x-csrf-token` header。
 * 只對非安全方法（POST/PUT/PATCH/DELETE）附加，符合 BFF `50.csrf.ts` 的驗證邏輯。
 *
 * ### 3. 錯誤正規化
 * 任何非 2xx 回應都會被轉成 `ApiError` 拋出，帶著 `code` / `message` /
 * `fieldErrors` / `requestId`。前端不需要再解析各種錯誤形狀。
 *
 * ### 4. 統一的 baseURL
 * 全部指向 `runtimeConfig.public.apiBase`（預設 `/api`）。
 * **前端不應該、也不能直接呼叫外部 API** —— CSP 的 `connect-src 'self'`
 * 會在瀏覽器層直接擋掉。所有外部呼叫一律經過 BFF。
 *
 * @returns 回傳**完整信封**（`ApiSuccess<T>`）的 `$fetch` 實例
 */
export function useApiClient() {
  const config = useRuntimeConfig()

  // SSR 期間讀取瀏覽器送來的 cookie；client 端由瀏覽器自動處理，不需要（也讀不到）
  const forwardedHeaders = import.meta.server ? useRequestHeaders(['cookie']) : {}

  const csrfCookie = useCookie(CSRF_COOKIE_NAME, { readonly: true })

  return $fetch.create({
    baseURL: config.public.apiBase,

    // 同源請求本來就會帶 cookie，明確寫出來是為了在有子網域設定時也能正確運作
    credentials: 'include',

    // 重試交給 BFF 的 upstream.ts 處理（那裡才知道哪些操作是冪等的）。
    // 前端盲目重試 POST 可能造成重複下單。
    retry: 0,

    onRequest({ options }) {
      const headers = new Headers(options.headers)

      // --- SSR cookie 轉發 ---
      for (const [key, value] of Object.entries(forwardedHeaders)) {
        if (value) headers.set(key, value)
      }

      // --- CSRF token ---
      const method = (options.method ?? 'GET').toUpperCase()
      const isSafeMethod = SAFE_METHODS.includes(method as (typeof SAFE_METHODS)[number])
      if (!isSafeMethod && csrfCookie.value) {
        headers.set(CSRF_HEADER_NAME, csrfCookie.value)
      }

      options.headers = headers
    },

    onResponseError({ response }) {
      // BFF 保證錯誤一定是 ApiFailure 格式
      if (isApiFailure(response._data)) {
        throw ApiError.fromFailure(response._data, response.status)
      }

      // 走到這裡代表回應不是我們的格式 —— 可能是反向代理擋下來了
      // （例如 502 Bad Gateway 的 HTML 頁面），或是打錯了不存在的網址
      throw new ApiError({
        code: response.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: '伺服器回應格式異常，請稍後再試',
        statusCode: response.status,
      })
    },

    onRequestError({ error }) {
      // 連不上伺服器：離線、DNS 失敗、逾時
      throw new ApiError({
        code: 'INTERNAL_ERROR',
        message: '無法連線至伺服器，請檢查網路連線',
        statusCode: 0,
        details: { cause: error.message },
      })
    },
  })
}
