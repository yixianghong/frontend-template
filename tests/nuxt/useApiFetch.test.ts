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

/**
 * 會計數的端點：每呼叫一次，`title` 就換一個號碼。
 *
 * 用來驗證 `revalidateOnEnter` —— 「有沒有重抓」不能只看呼叫次數，
 * 還要看畫面上拿到的是不是新的那一份。
 */
let counterHits = 0
registerEndpoint('/api/test/counter', () => {
  counterHits += 1
  return {
    success: true,
    data: [{ id: String(counterHits), title: `第 ${counterHits} 次` }],
    meta: { requestId: `req-${counterHits}`, timestamp: '2026-01-01T00:00:00.000Z' },
  }
})

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

/**
 * `revalidateOnEnter`。
 *
 * ## 這一組守的是什麼
 * `useApiFetch` 是包裝函式，所以整個專案的 `useFetch` 只有一個呼叫點，
 * `useAsyncData` 的 key 退化成「只看網址」—— **兩個讀同一支端點的頁面
 * 會共用同一筆快取**。而 Nuxt 只在「沒有任何元件還在用它」時才清掉快取，
 * 換頁時新頁面先掛載、舊頁面才卸載，參照數永遠不會歸零，於是 Nuxt
 * 直接沿用舊資料、一次請求都不發。
 *
 * 實際踩到的樣子：改完資料（已經寫進資料庫），走到另一個也讀同一支端點的
 * 頁面再回來，就變回改之前的內容；而且表單被舊資料灌回去，再存一次就真的蓋掉。
 *
 * 下面兩個測試刻意讓兩個元件**同時掛著**，重現的就是那個「參照數不歸零」
 * 的狀態。
 */
describe('useApiFetch 的 revalidateOnEnter', () => {
  /*
   * ⚠️ 每個案例要用**各自的網址**。
   *
   * 測試之間元件不會被卸載，而快取的 key 只看網址 —— 共用一個網址的話，
   * 上一個案例留下的那一筆會被下一個案例沿用（這正是本檔案在測的那個行為，
   * 拿來咬自己）。加一個 `case` 參數就各自獨立了。
   */
  function mountCounter(testCase: string, options?: { revalidateOnEnter: boolean }) {
    return mountSuspended(
      defineComponent({
        async setup() {
          return {
            ...(await useApiFetch<{ id: string; title: string }[]>(
              `/test/counter?case=${testCase}`,
              options,
            )),
          }
        },
        template: '<div />',
      }),
    )
  }

  it('★ 預設就是開的 —— 新專案不必為每支端點想這件事', async () => {
    counterHits = 0

    const first = await mountCounter('default')
    expect(first.vm.data?.[0]?.title).toBe('第 1 次')

    // 第一個還掛著（等同「新頁面先掛載、舊頁面還沒卸載」），快取不會被清掉
    const second = await mountCounter('default')

    expect(counterHits).toBe(2)
    expect(second.vm.data?.[0]?.title).toBe('第 2 次')
  })

  it('關掉之後會沿用前一個抓到的資料（這就是那個 bug 的樣子）', async () => {
    counterHits = 0

    const first = await mountCounter('off', { revalidateOnEnter: false })
    expect(first.vm.data?.[0]?.title).toBe('第 1 次')

    const second = await mountCounter('off', { revalidateOnEnter: false })

    expect(counterHits).toBe(1)
    expect(second.vm.data?.[0]?.title).toBe('第 1 次')
  })

  it('補抓要擋在 await 前面 —— 拿到手時已經是新資料，不是先舊後新', async () => {
    counterHits = 0

    await mountCounter('blocking')
    const second = await mountCounter('blocking')

    /*
     * 這一行是重點：`await` 回來的當下就該是新資料。
     * 如果補抓是在背景跑的，這裡會讀到舊的那一份，而畫面會先閃一下舊內容 ——
     * 表單類的頁面正是在那個空檔被舊資料灌回去的。
     */
    expect(second.vm.data?.[0]?.title).toBe('第 2 次')
  })

  it('只有一個讀取者時不會多打 —— 成本只發生在原本會出錯的情況', async () => {
    counterHits = 0

    const only = await mountCounter('single')

    expect(counterHits).toBe(1)
    expect(only.vm.data?.[0]?.title).toBe('第 1 次')
  })
})
