import tailwindcss from '@tailwindcss/vite'

/**
 * 樣板示範（`app/pages/demo/**` 與 `server/api/demo/**`）是否啟用。
 *
 * 預設「只有開發環境看得到」：production 建置時整組 demo 路由會被移除，
 * 程式碼**根本不會進到 bundle**，不是靠前端判斷擋下來的。
 *
 * `ENABLE_DEMO=true` 是給端對端測試用的例外開關 —— e2e 跑的是 production
 * 建置，需要 demo 路由存在才測得到完整鏈路。正式部署請不要設定它。
 */
const DEMO_ENABLED = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO === 'true'

/**
 * Nuxt 設定。
 *
 * 這個樣板的架構是 **前端 → BFF（Nitro）→ 外部 API**：
 * - `app/`    前端（Vue 3 + Tailwind 4），只認得 `/api/*`
 * - `server/` BFF（Nitro / h3 v1），唯一能碰外部 API 與 secrets 的地方
 * - `shared/` 前後端共用的型別、錯誤碼、zod schema
 */
export default defineNuxtConfig({
  // 鎖定 Nitro 的行為基準日，升級 Nuxt 時不會被預設值變動偷襲
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@pinia/nuxt', '@vueuse/nuxt', '@nuxtjs/i18n'],

  css: ['~/assets/css/main.css'],

  // Tailwind v4 走 CSS-first：不再需要 tailwind.config.js，也不需要 @nuxtjs/tailwindcss 模組，
  // 主題定義全部寫在 app/assets/css/main.css 的 @theme 區塊中。
  vite: {
    plugins: [tailwindcss()],
  },

  /**
   * ## composable 的自動匯入
   *
   * Nuxt 預設只掃描 `app/composables/` 的**最上層**檔案。這裡打開巢狀掃描，
   * 讓功能領域可以各自分一個資料夾：
   *
   * ```
   * app/composables/
   * ├─ useApi.ts / useApiFetch.ts / useApiClient.ts   通用基礎設施
   * ├─ useTheme.ts
   * └─ api/                                           每個功能領域一支
   *    ├─ useAuth.ts
   *    └─ useDemoApi.ts
   * ```
   *
   * 兩層都會被自動匯入，使用時不需要寫 import。
   */
  imports: {
    dirs: ['composables/**'],
  },

  typescript: {
    strict: true,
    // 型別檢查交給 `pnpm typecheck` 與 CI，不拖慢 dev server 的熱更新
    typeCheck: false,
  },

  /**
   * ## runtimeConfig
   *
   * 頂層的值**只存在於 server 端**，前端 bundle 永遠不會包含它們 ——
   * 這是 API key 與 session 密鑰能安全放在這裡的原因。
   * `public` 底下的值則會送到瀏覽器，只能放非機密設定。
   *
   * 執行期可用環境變數覆寫，命名規則是 `NUXT_` + 大寫底線化：
   * - `sessionPassword`   ← `NUXT_SESSION_PASSWORD`
   * - `apiBaseUrl`        ← `NUXT_API_BASE_URL`
   * - `public.appName`    ← `NUXT_PUBLIC_APP_NAME`
   *
   * 型別會依照這裡的預設值自動轉換（預設值是數字，env 字串就會被轉成數字）。
   * 完整清單見 `.env.example`；缺漏必填項會在啟動時由
   * `server/plugins/00.env-validate.ts` 直接讓程序 crash。
   */
  runtimeConfig: {
    // --- Session / 認證 ---
    /** 加密 session cookie 的密鑰，至少 32 字元。正式環境務必改掉。 */
    sessionPassword: '',
    /** session 有效秒數，預設 8 小時。 */
    sessionMaxAge: 60 * 60 * 8,

    // --- 上游 API ---
    /** 外部 API 的 base URL。 */
    apiBaseUrl: '',
    /** 外部 API 的靜態金鑰（若上游用 API key 而非 Bearer token）。 */
    apiKey: '',
    /** 呼叫上游的逾時毫秒數。 */
    upstreamTimeoutMs: 10_000,

    // --- 斷路器 ---
    /** 連續失敗幾次後跳閘。 */
    circuitBreakerThreshold: 5,
    /** 跳閘後多久進入 half-open 試探。 */
    circuitBreakerResetMs: 30_000,

    // --- 資安 ---
    /** CORS 允許的來源，多個以逗號分隔。留空表示只允許同源。 */
    corsOrigins: '',
    /** 單一 IP 在時間窗內的最大請求數。 */
    rateLimitMax: 100,
    /** 流量限制的時間窗（毫秒）。 */
    rateLimitWindowMs: 60_000,
    /** request body 大小上限（bytes），預設 1MB。 */
    maxBodyBytes: 1_048_576,

    public: {
      /** 顯示用的應用名稱。 */
      appName: 'Frontend Template',
      /** 前端呼叫 BFF 的基底路徑。前端**只能**打這個前綴底下的路由。 */
      apiBase: '/api',
      /**
       * 登入頁的路徑。
       *
       * 集中設定的理由：`middleware/auth.ts` 的導向、`useAuth().logout()` 的
       * 預設導向都會用到它。樣板的登入頁在 demo 底下（production 不存在），
       * 各專案建立自己的登入頁之後，把這個值改掉就好，不必去翻程式碼。
       */
      loginPath: '/demo/login',
      /** demo 是否啟用。僅供畫面決定要不要顯示入口連結，路由本身在建置期就已決定。 */
      demoEnabled: DEMO_ENABLED,
      /** 網站正式網址，供 SEO 與絕對連結使用。 */
      siteUrl: 'http://localhost:3000',
    },
  },

  /**
   * 建置期移除 demo 路由。
   *
   * 用 `pages:extend` 而不是路由 middleware，差別在於：
   * - middleware 只是「進去之後把你擋下來」，頁面程式碼仍然會被打包進 bundle
   * - 這裡是直接讓路由不存在，程式碼不會被打包，production 自然回 404
   *
   * 對應的 BFF 端點由 `server/middleware/15.demo-guard.ts` 擋下。
   */
  hooks: {
    'pages:extend'(pages) {
      if (DEMO_ENABLED) return

      const stripDemoRoutes = (list: typeof pages) => {
        for (let index = list.length - 1; index >= 0; index--) {
          const page = list[index]!
          if (page.path === '/demo' || page.path.startsWith('/demo/')) {
            list.splice(index, 1)
            continue
          }
          // Nuxt 在有父層元件時會產生巢狀路由，這裡一併處理
          if (page.children?.length) stripDemoRoutes(page.children)
        }
      }

      stripDemoRoutes(pages)
    },
  },

  nitro: {
    // 目標為容器化部署（Docker + K8s / Cloud Run）
    preset: 'node-server',

    /**
     * 兜底錯誤處理。任何沒被 `defineApiHandler` 接到的錯誤（404、middleware 拋錯）
     * 都會走到這裡，確保 `/api/*` 永遠回傳統一的 JSON 錯誤格式而非 HTML 錯誤頁。
     */
    errorHandler: '~~/server/error',

    /**
     * KV 儲存。預設 memory driver 只適用單機。
     * 多實例部署時改成 Redis，業務程式碼一行都不用動：
     *
     * ```ts
     * storage: {
     *   ratelimit: { driver: 'redis', url: process.env.REDIS_URL },
     *   cache:     { driver: 'redis', url: process.env.REDIS_URL },
     * }
     * ```
     */
    storage: {
      ratelimit: { driver: 'memory' },
      cache: { driver: 'memory' },
    },

    // 移除會洩漏技術棧的預設 header
    routeRules: {
      '/api/**': {
        headers: {
          'x-powered-by': '',
        },
      },
    },
  },

  /**
   * i18n。預設繁體中文，`prefix_except_default` 表示中文站台維持 `/about`，
   * 英文站台則是 `/en/about`，對 SEO 較友善。
   * 語系檔位於 `i18n/locales/`。
   */
  i18n: {
    defaultLocale: 'zh-TW',
    strategy: 'prefix_except_default',
    locales: [
      { code: 'zh-TW', language: 'zh-TW', name: '繁體中文', file: 'zh-TW.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      // 只在首頁做一次偵測導向，避免每頁都跳轉造成 SEO 問題
      redirectOn: 'root',
      cookieSecure: process.env.NODE_ENV === 'production',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-TW' },
      meta: [
        { charset: 'utf-8' },
        // RWD 的起點：沒有這行，所有 Tailwind 斷點在手機上都不會如預期運作
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  future: {
    compatibilityVersion: 4,
  },
})
