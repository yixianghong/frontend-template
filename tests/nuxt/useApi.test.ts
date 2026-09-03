// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { defineEventHandler, setResponseStatus } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'

/**
 * 【呼叫方式 B】useApi 的行為測試。
 *
 * 用 `registerEndpoint` 攔截 BFF 端點，就能在不啟動真實伺服器的情況下
 * 驗證 composable 的完整行為（拆封、錯誤轉換、loading 狀態）。
 */

// 成功回應：BFF 的標準信封
registerEndpoint('/api/test/ok', () => ({
  success: true,
  data: { id: '1', title: '測試項目' },
  meta: { requestId: 'req-ok', timestamp: '2026-01-01T00:00:00.000Z' },
}))

// 失敗回應：驗證錯誤，帶欄位層級細節
registerEndpoint(
  '/api/test/invalid',
  defineEventHandler((event) => {
    setResponseStatus(event, 400)
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '請求參數有誤',
        details: { fieldErrors: { email: ['格式不正確'] }, formErrors: [] },
        requestId: 'req-invalid',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }
  }),
)

registerEndpoint(
  '/api/test/unauthorized',
  defineEventHandler((event) => {
    setResponseStatus(event, 401)
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '請先登入',
        requestId: 'req-401',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }
  }),
)

/**
 * 把 composable 掛進元件中執行 —— composable 需要 Nuxt 的執行上下文。
 *
 * 注意這裡用**展開**（`...useApi()`）而不是包成 `{ api: useApi() }`：
 * Vue 只會自動解包 setup 回傳物件**最外層**的 ref，包在巢狀物件裡的 ref
 * 在模板與 `wrapper.vm` 上都還是 ref 物件，測試會比對到錯的東西。
 */
function mountApi() {
  return mountSuspended(
    defineComponent({
      setup: () => ({ ...useApi() }),
      template: '<div />',
    }),
  )
}

describe('useApi（命令式）', () => {
  it('自動拆封信封，直接回傳 data 而非整包回應', async () => {
    const wrapper = await mountApi()

    const result = await wrapper.vm.get<{ id: string; title: string }>('/test/ok')

    // 拿到的是 data 本身，不需要再寫 result.data.data
    expect(result).toEqual({ id: '1', title: '測試項目' })
  })

  it('把回應的 meta 存進 lastMeta，供讀取 requestId', async () => {
    const wrapper = await mountApi()

    await wrapper.vm.get('/test/ok')

    expect(wrapper.vm.lastMeta?.requestId).toBe('req-ok')
  })

  it('把失敗回應轉成 ApiError，並保留欄位錯誤', async () => {
    const wrapper = await mountApi()

    await expect(wrapper.vm.get('/test/invalid')).rejects.toThrow(ApiError)

    const error = wrapper.vm.error
    expect(error).toBeInstanceOf(ApiError)
    expect(error?.code).toBe('VALIDATION_ERROR')
    expect(error?.statusCode).toBe(400)
    expect(error?.fieldErrors).toEqual({ email: ['格式不正確'] })
    expect(error?.requestId).toBe('req-invalid')
  })

  it('401 錯誤可用 isAuthError 判斷，方便導向登入頁', async () => {
    const wrapper = await mountApi()

    await expect(wrapper.vm.get('/test/unauthorized')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(wrapper.vm.error?.isAuthError).toBe(true)
  })

  it('attempt() 不拋例外，改回傳 { data, error }', async () => {
    const wrapper = await mountApi()

    const ok = await wrapper.vm.attempt(() => wrapper.vm.get('/test/ok'))
    expect(ok.error).toBeNull()
    expect(ok.data).toEqual({ id: '1', title: '測試項目' })

    const failed = await wrapper.vm.attempt(() => wrapper.vm.get('/test/invalid'))
    expect(failed.data).toBeNull()
    expect(failed.error?.code).toBe('VALIDATION_ERROR')
  })

  it('loading 在請求期間為 true，結束後回到 false', async () => {
    const wrapper = await mountApi()

    expect(wrapper.vm.loading).toBe(false)

    const promise = wrapper.vm.get('/test/ok')
    expect(wrapper.vm.loading).toBe(true)

    await promise
    expect(wrapper.vm.loading).toBe(false)
  })

  it('新請求開始時會清掉上一次的錯誤', async () => {
    const wrapper = await mountApi()

    await wrapper.vm.attempt(() => wrapper.vm.get('/test/invalid'))
    expect(wrapper.vm.error).not.toBeNull()

    await wrapper.vm.get('/test/ok')
    expect(wrapper.vm.error).toBeNull()
  })
})
