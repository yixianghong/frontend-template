// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'

/**
 * 領域 composable 的測試。
 *
 * 這一層值得單獨測，因為它承載了「端點路徑、預設參數、型別」這些會被
 * 多個頁面共用的決定。測這裡一次，勝過在每個用到它的頁面各測一遍。
 */

// stub 端點會把收到的 query 原樣回填進 meta.pagination，
// 測試因此可以從回應反推「BFF 實際收到了什麼參數」，
// 而不需要去數請求次數 —— useAsyncData 會依 key 去重，數次數並不可靠。
registerEndpoint(
  '/api/demo/list',
  defineEventHandler((event) => {
    const query = getQuery(event)
    const pageSize = Number(query.pageSize ?? 20)
    return {
      success: true,
      data: Array.from({ length: Math.min(pageSize, 3) }, (_, i) => ({
        id: String(i + 1),
        title: `項目 ${i + 1}`,
        description: '描述',
        createdAt: '2026-01-01T00:00:00.000Z',
      })),
      meta: {
        requestId: 'req-list',
        timestamp: '2026-01-01T00:00:00.000Z',
        pagination: {
          page: Number(query.page ?? 1),
          pageSize,
          total: 25,
          totalPages: Math.ceil(25 / pageSize),
          hasNext: true,
        },
      },
    }
  }),
)

registerEndpoint('/api/demo/7', () => ({
  success: true,
  data: { id: '7', title: '第七筆', description: '描述', createdAt: '2026-01-01T00:00:00.000Z' },
  meta: { requestId: 'req-detail', timestamp: '2026-01-01T00:00:00.000Z' },
}))

registerEndpoint(
  '/api/demo/missing',
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

/** 掛載一個把 composable 展開回傳的測試元件。 */
function mountComposable<T extends Record<string, unknown>>(factory: () => T | Promise<T>) {
  return mountSuspended(
    defineComponent({
      async setup() {
        return { ...(await factory()) }
      },
      template: '<div />',
    }),
  )
}

describe('useDemoItems（宣告式列表）', () => {
  it('取得列表資料，頁面不需要知道端點路徑', async () => {
    const wrapper = await mountComposable(() => useDemoItems())

    expect(wrapper.vm.data).toHaveLength(3)
    expect(wrapper.vm.data?.[0]?.title).toBe('項目 1')
  })

  it('未指定時套用 composable 的預設 pageSize（避免各頁不一致）', async () => {
    const wrapper = await mountComposable(() => useDemoItems())

    // 端點會回填收到的參數，所以這等於驗證了「預設值確實送到了 BFF」
    expect(wrapper.vm.pagination?.pageSize).toBe(20)
    expect(wrapper.vm.pagination?.page).toBe(1)
  })

  it('可覆寫分頁參數', async () => {
    const wrapper = await mountComposable(() => useDemoItems({ page: 3, pageSize: 6 }))

    expect(wrapper.vm.pagination).toMatchObject({ page: 3, pageSize: 6 })
  })

  it('傳入 ref 時保留響應性：page 改變會自動重新載入', async () => {
    // 這是很容易寫錯的一點：composable 內部若用 toValue() 取值就會斷開追蹤，
    // 之後 page 再變也不會重抓。這個測試就是在守住那件事。
    const page = ref(1)
    const wrapper = await mountComposable(() => useDemoItems({ page, pageSize: 6 }))

    expect(wrapper.vm.pagination?.page).toBe(1)

    page.value = 2
    await vi.waitUntil(() => wrapper.vm.pagination?.page === 2)

    expect(wrapper.vm.pagination?.page).toBe(2)
  })

  it('分頁資訊直接可用，不需要頁面自己算', async () => {
    const wrapper = await mountComposable(() => useDemoItems({ page: 1, pageSize: 5 }))

    expect(wrapper.vm.pagination).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 25,
      totalPages: 5,
      hasNext: true,
    })
  })
})

describe('useDemoItem（宣告式單筆）', () => {
  it('依 id 取得單筆資料', async () => {
    const wrapper = await mountComposable(() => useDemoItem('7'))

    expect(wrapper.vm.data?.id).toBe('7')
    expect(wrapper.vm.data?.title).toBe('第七筆')
  })

  it('找不到時回傳正規化後的 NOT_FOUND 錯誤', async () => {
    const wrapper = await mountComposable(() => useDemoItem('missing'))

    expect(wrapper.vm.error).toBeInstanceOf(ApiError)
    expect(wrapper.vm.error?.code).toBe('NOT_FOUND')
    expect(wrapper.vm.data).toBeNull()
  })

  it('接受 getter，id 改變時重新載入', async () => {
    const id = ref('missing')
    const wrapper = await mountComposable(() => useDemoItem(() => id.value))

    expect(wrapper.vm.error?.code).toBe('NOT_FOUND')

    id.value = '7'
    await vi.waitUntil(() => wrapper.vm.data !== null)

    expect(wrapper.vm.data?.id).toBe('7')
  })
})

describe('useDemoActions（命令式）', () => {
  it('fetchItem 回傳已拆封的資料', async () => {
    const wrapper = await mountComposable(() => useDemoActions())

    const item = await wrapper.vm.fetchItem('7')

    expect(item).toMatchObject({ id: '7', title: '第七筆' })
  })

  it('失敗時拋出 ApiError 並更新 error 狀態', async () => {
    const wrapper = await mountComposable(() => useDemoActions())

    await expect(wrapper.vm.fetchItem('missing')).rejects.toThrow(ApiError)
    expect(wrapper.vm.error?.code).toBe('NOT_FOUND')
  })

  it('loading 在請求期間為 true', async () => {
    const wrapper = await mountComposable(() => useDemoActions())

    expect(wrapper.vm.loading).toBe(false)
    const promise = wrapper.vm.fetchItem('7')
    expect(wrapper.vm.loading).toBe(true)

    await promise
    expect(wrapper.vm.loading).toBe(false)
  })
})
