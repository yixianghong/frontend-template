import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * demo API 守衛。
 *
 * 前端的 demo 頁面在建置期就被移除（`nuxt.config.ts` 的 `pages:extend`），
 * 但 Nitro 的路由是掃描檔案系統決定的，沒辦法用同樣的方式抽掉，
 * 所以 `server/api/demo/**` 需要這道執行期守衛。
 *
 * 「production 建置後 demo 頁面確實 404」則由 CI 的 build job 驗證
 * （見 .github/workflows/ci.yml），那需要一次真實建置才測得到。
 */

type FakeEvent = { path: string; context: Record<string, unknown> }

/**
 * ⚠️ 這裡刻意用「比對錯誤內容」而不是 `toThrow(AppError)`。
 *
 * `vi.resetModules()` 會讓每次 `import()` 拿到全新的模組實例，
 * 連帶 `AppError` 也是一個**不同的 class 物件** —— 即使錯誤確實是 AppError，
 * `instanceof` 仍然會是 false。比對 `code` / `statusCode` 才穩定。
 */
const expectNotFound = expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 })

async function loadGuard(demoEnabled: boolean) {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { demoEnabled } }))
  vi.resetModules()

  const module = await import('../../server/middleware/15.demo-guard')
  return module.default as unknown as (event: FakeEvent) => void
}

const eventOf = (path: string): FakeEvent => ({ path, context: {} })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('15.demo-guard', () => {
  it('demo 關閉時，demo API 回 404 而非 403', async () => {
    const guard = await loadGuard(false)

    // 用 404 是刻意的：「這個環境沒有這個端點」比「有但你沒權限」更貼近事實，
    // 也不會洩漏 production 有哪些隱藏端點
    expect(() => guard(eventOf('/api/demo/list'))).toThrowError(expectNotFound)
  })

  it('擋下 demo 底下的所有路徑', async () => {
    const guard = await loadGuard(false)

    for (const path of ['/api/demo/list', '/api/demo/7', '/api/demo/anything/nested']) {
      expect(() => guard(eventOf(path))).toThrowError(expectNotFound)
    }
  })

  it('demo 開啟時放行（開發環境與 e2e）', async () => {
    const guard = await loadGuard(true)

    expect(() => guard(eventOf('/api/demo/list'))).not.toThrow()
  })

  it('不影響其他端點 —— 即使 demo 已關閉', async () => {
    const guard = await loadGuard(false)

    for (const path of ['/api/health', '/api/auth/me', '/api/orders', '/']) {
      expect(() => guard(eventOf(path))).not.toThrow()
    }
  })
})
