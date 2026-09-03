// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { defineEventHandler, setResponseStatus } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'

/**
 * 【呼叫方式 A】useApiFetch 的行為測試。
 *
 * 重點驗證兩件事：
 * 1. 資料被正確拆封（`data` 是 items 本身，不是整包信封）
 * 2. 分頁資訊從 `meta.pagination` 被提取出來
 */

registerEndpoint('/api/test/list', () => ({
  success: true,
  data: [
    { id: '1', title: '第一筆' },
    { id: '2', title: '第二筆' },
  ],
  meta: {
    requestId: 'req-list',
    timestamp: '2026-01-01T00:00:00.000Z',
    pagination: { page: 1, pageSize: 2, total: 10, totalPages: 5, hasNext: true },
  },
}))

registerEndpoint(
  '/api/test/missing',
  defineEventHandler((event) => {
    setResponseStatus(event, 404)
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '找不到指定的資源',
        requestId: 'req-404',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }
  }),
)

/**
 * 展開回傳值，讓 Vue 自動解包最外層的 ref
 * （包在巢狀物件裡的 ref 不會被解包）。
 *
 * `await` 是關鍵：它讓 `<Suspense>` 等資料到齊才渲染，
 * 也就是 SSR 能產出「已經有資料」的 HTML 的原因。
 */
function mountFetch(path: string) {
  return mountSuspended(
    defineComponent({
      async setup() {
        return { ...(await useApiFetch<{ id: string; title: string }[]>(path)) }
      },
      template: '<div />',
    }),
  )
}

/** 不 await 的版本：資料尚未到齊就先渲染，用 pending 控制畫面。 */
function mountFetchLazy(path: string) {
  return mountSuspended(
    defineComponent({
      setup: () => ({ ...useApiFetch<{ id: string; title: string }[]>(path) }),
      template: '<div />',
    }),
  )
}

describe('useApiFetch（宣告式）', () => {
  it('自動拆封 data', async () => {
    const wrapper = await mountFetch('/test/list')

    expect(wrapper.vm.data).toEqual([
      { id: '1', title: '第一筆' },
      { id: '2', title: '第二筆' },
    ])
  })

  it('從 meta 提取分頁資訊', async () => {
    const wrapper = await mountFetch('/test/list')

    expect(wrapper.vm.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 10,
      totalPages: 5,
      hasNext: true,
    })
  })

  it('保留 meta 以取得 requestId', async () => {
    const wrapper = await mountFetch('/test/list')
    expect(wrapper.vm.meta?.requestId).toBe('req-list')
  })

  it('載入完成後 pending 為 false 且無錯誤', async () => {
    const wrapper = await mountFetch('/test/list')

    expect(wrapper.vm.pending).toBe(false)
    expect(wrapper.vm.error).toBeNull()
    expect(wrapper.vm.status).toBe('success')
  })

  it('不 await 也能運作：資料到齊後 ref 會自動更新', async () => {
    // 不 await 的版本不會讓 Suspense 等待，元件先渲染、資料稍後補上。
    // 這裡不斷言「當下 pending 是 true」——那取決於解析速度，會造成不穩定的測試；
    // 真正該保證的是「最終會拿到資料」。
    const wrapper = await mountFetchLazy('/test/list')

    await vi.waitUntil(() => wrapper.vm.status === 'success')

    expect(wrapper.vm.pending).toBe(false)
    expect(wrapper.vm.data).toHaveLength(2)
  })

  it('失敗時 error 是正規化後的 ApiError（而非 Nuxt 的原始錯誤）', async () => {
    const wrapper = await mountFetch('/test/missing')

    const error = wrapper.vm.error
    expect(error).toBeInstanceOf(ApiError)
    expect(error?.code).toBe('NOT_FOUND')
    expect(wrapper.vm.data).toBeNull()
  })
})
