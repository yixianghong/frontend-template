import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { startUpstreamStub } from '../mocks/upstream-server'

/**
 * 端對端整合測試 —— 驗證「前端 → BFF → 外部 API」完整鏈路。
 *
 * 這裡會真的建置 Nuxt、啟動伺服器、並讓 BFF 透過真實的 HTTP 連上
 * 一個 stub 的外部 API。因此涵蓋到的是單元測試看不到的部分：
 * middleware 的執行順序、cookie 的實際行為、SSR 的輸出、
 * 錯誤在各層之間的傳遞方式。
 *
 * 執行：`pnpm test:e2e`（會花上一兩分鐘，因為包含一次完整建置）
 */

// demo 路由預設只在開發環境存在（production 建置時會被 pages:extend 移除）。
// e2e 跑的是 production 建置，所以要用這個例外開關把它打開，
// 才測得到「前端 → BFF → 外部 API」的完整鏈路。
// ⚠️ 必須在 setup() 之前設定 —— 路由的去留是在建置期決定的。
process.env.ENABLE_DEMO = 'true'

// 先起 stub 上游，才能把它的位址交給 Nuxt 建置設定
const upstream = await startUpstreamStub()

await setup({
  server: true,
  browser: false,
  nuxtConfig: {
    runtimeConfig: {
      apiBaseUrl: upstream.baseUrl,
      sessionPassword: 'e2e-test-session-password-with-enough-length',
      // 放寬限制，避免測試之間互相觸發限流
      rateLimitMax: 50,
      rateLimitWindowMs: 60_000,
    },
  },
})

afterAll(async () => {
  await upstream.close()
})

describe('統一回應格式', () => {
  it('成功回應帶有 success / data / meta 三段', async () => {
    const body = await $fetch<Record<string, unknown>>('/api/health')

    expect(body).toMatchObject({
      success: true,
      data: { status: 'ok' },
    })
    expect(body.meta).toMatchObject({
      requestId: expect.any(String),
      timestamp: expect.any(String),
    })
  })

  it('列表端點帶有分頁資訊', async () => {
    const body = await $fetch<{ data: unknown[]; meta: { pagination: unknown } }>(
      '/api/demo/list?page=2&pageSize=10',
    )

    expect(body.data).toHaveLength(10)
    expect(body.meta.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
    })
  })

  it('requestId 同時出現在回應標頭與 body 中（可交叉比對 log）', async () => {
    const response = await fetch('/api/health')
    const body = await response.json()

    expect(response.headers.get('x-request-id')).toBe(body.meta.requestId)
  })

  it('沿用用戶端傳入的 x-request-id 以串接跨服務追蹤', async () => {
    const response = await fetch('/api/health', {
      headers: { 'x-request-id': 'trace-from-gateway-123' },
    })

    expect(response.headers.get('x-request-id')).toBe('trace-from-gateway-123')
  })

  it('拒絕格式異常的 x-request-id（防止 log injection）', async () => {
    const response = await fetch('/api/health', {
      headers: { 'x-request-id': 'bad id with spaces' },
    })

    expect(response.headers.get('x-request-id')).not.toBe('bad id with spaces')
  })
})

describe('統一錯誤格式', () => {
  it('不存在的 API 路由回傳 JSON 錯誤信封而非 HTML', async () => {
    const response = await fetch('/api/this-route-does-not-exist')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.requestId).toEqual(expect.any(String))
  })

  it('handler 內拋出的 AppError 會轉成對應狀態碼', async () => {
    const response = await fetch('/api/demo/99999')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('驗證失敗回傳 400 與欄位層級的錯誤細節', async () => {
    const response = await fetch('/api/demo/list?page=abc')
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details.fieldErrors).toHaveProperty('page')
  })

  it('擋下超出上限的 pageSize，保護上游服務', async () => {
    const response = await fetch('/api/demo/list?pageSize=100000')

    expect(response.status).toBe(400)
  })

  it('錯誤回應不可被快取', async () => {
    const response = await fetch('/api/this-route-does-not-exist')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})

describe('資安標頭', () => {
  it('頁面回應帶齊基礎防護標頭', async () => {
    const response = await fetch('/')

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('permissions-policy')).toContain('camera=()')
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
  })

  it('CSP 禁止被嵌入 iframe，且前端只能連回自己', async () => {
    const csp = (await fetch('/')).headers.get('content-security-policy') ?? ''

    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    // connect-src 'self' 讓瀏覽器層就擋下前端直連外部 API 的嘗試
    expect(csp).toContain("connect-src 'self'")
  })

  it('不洩漏技術棧資訊', async () => {
    const response = await fetch('/api/health')
    expect(response.headers.get('x-powered-by')).toBeFalsy()
  })
})

describe('BFF 代理外部 API', () => {
  it('資料確實來自 stub 上游而非寫死在 BFF', async () => {
    const body = await $fetch<{ data: Array<{ title: string }> }>('/api/demo/list?pageSize=3')

    expect(body.data[0]?.title).toBe('上游項目 1')
  })

  it('把 x-request-id 傳遞給上游，實現跨服務追蹤', async () => {
    const before = upstream.requests.length
    await fetch('/api/demo/list?pageSize=1', {
      headers: { 'x-request-id': 'cross-service-trace-id' },
    })

    const received = upstream.requests.slice(before)
    expect(received.at(-1)?.headers['x-request-id']).toBe('cross-service-trace-id')
  })

  it('上游 404 會被映射成我們的 NOT_FOUND', async () => {
    const response = await fetch('/api/demo/99999')
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })
})

describe('認證：token 絕不離開 Node 層', () => {
  async function login(password = 'password1234') {
    return fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'e2e@example.com', password }),
    })
  }

  it('登入成功只回傳公開的使用者資料', async () => {
    const response = await login()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      id: 'u-1',
      email: 'e2e@example.com',
      name: 'E2E User',
      roles: ['user'],
    })
  })

  // 這是整個 BFF 架構最核心的安全保證
  it('回應中完全不含任何 upstream token', async () => {
    const raw = await (await login()).text()

    expect(raw).not.toContain('upstream-secret-access-token')
    expect(raw).not.toContain('upstream-secret-refresh-token')
  })

  it('剝除上游夾帶的內部欄位', async () => {
    const raw = await (await login()).text()
    expect(raw).not.toContain('internalRiskScore')
  })

  it('session cookie 為 httpOnly，前端 JS 讀不到', async () => {
    const setCookie = (await login()).headers.get('set-cookie') ?? ''

    expect(setCookie).toContain('app_session=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('session cookie 內容是密文，看不出 token', async () => {
    const setCookie = (await login()).headers.get('set-cookie') ?? ''
    expect(setCookie).not.toContain('upstream-secret-access-token')
  })

  it('CSRF cookie 刻意可被 JS 讀取（double-submit 需要）', async () => {
    const setCookie = (await login()).headers.get('set-cookie') ?? ''
    const csrfPart = setCookie.split(',').find((part) => part.includes('csrf_token='))

    expect(csrfPart).toBeTruthy()
    expect(csrfPart?.toLowerCase()).not.toContain('httponly')
  })

  it('帳密錯誤回傳 401 且不透露是帳號還是密碼錯', async () => {
    const response = await login('wrong-password')
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('未登入時 /api/auth/me 回傳 401', async () => {
    const response = await fetch('/api/auth/me')
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('帶著 session cookie 就能取回使用者資料', async () => {
    const cookies = (await login()).headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const response = await fetch('/api/auth/me', { headers: { cookie: cookies } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.email).toBe('e2e@example.com')
  })
})

describe('CSRF 防護', () => {
  it('已登入但缺少 CSRF header 的寫入請求會被擋下', async () => {
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'csrf@example.com', password: 'password1234' }),
    })
    const cookies = loginResponse.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    // 惡意網站能讓瀏覽器自動帶上 cookie，但因為同源政策讀不到 cookie 內容，
    // 所以填不出正確的 x-csrf-token header
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: cookies },
    })

    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('CSRF_INVALID')
  })

  it('帶上正確的 CSRF token 就能通過', async () => {
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'csrf2@example.com', password: 'password1234' }),
    })
    const setCookies = loginResponse.headers.getSetCookie()
    const cookies = setCookies.map((c) => c.split(';')[0]).join('; ')
    const csrfToken = setCookies
      .find((c) => c.startsWith('csrf_token='))
      ?.split(';')[0]
      ?.replace('csrf_token=', '')

    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: cookies, 'x-csrf-token': decodeURIComponent(csrfToken ?? '') },
    })

    expect(response.status).toBe(200)
  })

  it('未登入的請求不需要 CSRF token（沒有登入狀態可盜用）', async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    expect(response.status).toBe(200)
  })
})

describe('請求主體防護', () => {
  it('拒絕不支援的 Content-Type', async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body: '<login />',
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('BAD_REQUEST')
  })
})

describe('流量限制', () => {
  // 用專屬的 x-forwarded-for 取得獨立的計數桶，
  // 才不會把配額吃掉、影響其他測試
  it('超過上限後回傳 429 與 Retry-After', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' }

    let lastResponse: Response | undefined
    for (let i = 0; i < 60; i++) {
      lastResponse = await fetch('/api/demo/list?pageSize=1', { headers })
      if (lastResponse.status === 429) break
    }

    expect(lastResponse?.status).toBe(429)
    expect(lastResponse?.headers.get('retry-after')).toBeTruthy()
    expect((await lastResponse!.json()).error.code).toBe('RATE_LIMITED')
  })

  it('正常請求會帶上 RateLimit 標頭，讓用戶端能主動退讓', async () => {
    const response = await fetch('/api/demo/list?pageSize=1', {
      headers: { 'x-forwarded-for': '203.0.113.88' },
    })

    expect(response.headers.get('ratelimit-limit')).toBe('50')
    expect(Number(response.headers.get('ratelimit-remaining'))).toBeGreaterThanOrEqual(0)
  })

  it('健康檢查端點不受限流影響（避免探針被誤擋導致 Pod 重啟）', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' } // 已經被限流的 IP
    const response = await fetch('/api/health', { headers })

    expect(response.status).toBe(200)
  })
})

describe('SSR', () => {
  it('首頁 HTML 在伺服器端就已渲染完成（不是空殼）', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('<div id="__nuxt">')
    // 首頁是給各專案替換的佔位頁面
    expect(html).toContain('Frontend Template')
  })

  it('列表頁的資料在 SSR 階段就已取得並寫進 HTML', async () => {
    const html = await $fetch<string>('/demo/api')

    // 這證明 useApiFetch 的 SSR 有生效：資料是伺服器端抓的，
    // 直接出現在 HTML 中，對 SEO 與首屏速度都有幫助
    expect(html).toContain('上游項目 1')
  })

  it('詳情頁的資料同樣在 SSR 階段完成', async () => {
    const html = await $fetch<string>('/demo/api/3')
    expect(html).toContain('上游項目 3')
  })

  it('不存在的資料回傳 404 狀態碼（SEO 需要正確的狀態碼）', async () => {
    const response = await fetch('/demo/api/99999')
    expect(response.status).toBe(404)
  })

  it('深色模式偏好由 cookie 決定，SSR 就輸出正確的 class（不會閃爍）', async () => {
    const html = await $fetch<string>('/', { headers: { cookie: 'color_mode=dark' } })
    expect(html).toContain('class="dark"')
  })
})

describe('demo 區的環境限制', () => {
  // 這一組測試跑在 ENABLE_DEMO=true 之下，驗證「開關打開時 demo 是通的」。
  // 「開關關閉時 demo 不存在」需要另一次建置才能驗，
  // 因此改由 CI 的 build job 在正常 production 建置後檢查（見 .github/workflows/ci.yml）。
  it('開關打開時 demo 頁面可以進入', async () => {
    const response = await fetch('/demo')
    expect(response.status).toBe(200)
  })

  it('開關打開時 demo API 可以呼叫', async () => {
    const response = await fetch('/api/demo/list?pageSize=1')
    expect(response.status).toBe(200)
  })

  it('登入頁位於 demo 底下', async () => {
    const response = await fetch('/demo/login')
    expect(response.status).toBe(200)
  })
})

describe('健康檢查', () => {
  it('/api/health 回報存活狀態與 uptime', async () => {
    const body = await $fetch<{ data: { status: string; uptimeSeconds: number } }>('/api/health')

    expect(body.data.status).toBe('ok')
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('/api/ready 回報就緒狀態與各項檢查結果', async () => {
    const body = await $fetch<{ data: { ready: boolean; checks: Record<string, unknown> } }>(
      '/api/ready',
    )

    expect(body.data.ready).toBe(true)
    expect(body.data.checks.storage).toBe('ok')
    expect(body.data.checks.shuttingDown).toBe(false)
  })
})
