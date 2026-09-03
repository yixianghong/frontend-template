import type { UseFetchOptions } from 'nuxt/app'
import type { ApiSuccess, Pagination } from '#shared/types/api'
import { ApiError } from '~/utils/api-error'

/**
 * 【呼叫方式 A：宣告式】頁面載入時取資料，SSR 首選。
 *
 * 這是 `useFetch` 的封裝。**如果你不確定該用哪一個，先用這個。**
 *
 * ═══════════════════════════════════════════════════════════════════
 * ## 什麼時候用 A（useApiFetch），什麼時候用 B（useApi）
 *
 * | | A：`useApiFetch` | B：`useApi` |
 * |---|---|---|
 * | 觸發時機 | 元件建立時自動執行 | 你呼叫時才執行 |
 * | 底層 | `useFetch`（= `useAsyncData` + `$fetch`） | `$fetch` |
 * | SSR | ✅ server 端取好資料寫進 payload，client 不重打 | ❌ 只在呼叫當下執行 |
 * | 適用 | 列表頁、詳情頁、任何「進頁面就該有」的資料 | 送出表單、刪除、載入更多 |
 * | 回傳 | 響應式 refs（`data` / `pending` / `error`） | Promise（await 取值） |
 *
 * **一句話判斷**：資料是「畫面的一部分」用 A；是「動作的結果」用 B。
 * ═══════════════════════════════════════════════════════════════════
 *
 * ## 為什麼 SSR 場景一定要用 A
 * `useFetch` 會在 server 端取好資料，序列化進 HTML 的 payload 一起送到瀏覽器。
 * 瀏覽器 hydration 時**直接讀 payload，不會再打一次 API**。
 *
 * 如果在 `<script setup>` 頂層直接用 `$fetch`（方式 B），資料會被抓兩次
 * （SSR 一次、hydration 一次），不只浪費，還可能因為兩次結果不同而造成
 * hydration mismatch 警告。
 *
 * ---
 *
 * @example 最基本 —— 進頁面就載入
 * ```vue
 * <script setup lang="ts">
 * const { data: items, pending, error } = useApiFetch<DemoItem[]>('/demo/list')
 * </script>
 *
 * <template>
 *   <div v-if="pending">載入中…</div>
 *   <div v-else-if="error">{{ error.message }}</div>
 *   <ul v-else><li v-for="item in items" :key="item.id">{{ item.title }}</li></ul>
 * </template>
 * ```
 *
 * @example 帶查詢參數，且參數改變時自動重新載入
 * ```ts
 * const page = ref(1)
 * // query 傳 ref，useFetch 會自動 watch 它；page.value++ 就會重新抓資料
 * const { data, pagination } = useApiFetch<DemoItem[]>('/demo/list', {
 *   query: { page, pageSize: 20 },
 * })
 * ```
 *
 * @example 動態路由 —— url 用 getter 函式，路由變化時自動重抓
 * ```ts
 * const route = useRoute()
 * const { data: item } = useApiFetch<DemoItem>(() => `/demo/${route.params.id}`)
 * ```
 *
 * @example 讀取分頁資訊
 * ```ts
 * const { data, pagination } = useApiFetch<DemoItem[]>('/demo/list', { query: { page } })
 * // pagination.value → { page, pageSize, total, totalPages, hasNext }
 * ```
 *
 * @example 不要在 SSR 執行（例如需要瀏覽器 API 的資料）
 * ```ts
 * const { data } = useApiFetch('/demo/list', { server: false, lazy: true })
 * ```
 *
 * @example 手動重新整理
 * ```ts
 * const { data, refresh } = useApiFetch('/demo/list')
 * // 使用者按下重新整理按鈕
 * await refresh()
 * ```
 *
 * @param url 端點路徑（相對於 `/api`），可傳字串或 getter 函式
 * @param options `useFetch` 的所有選項都支援（`lazy` / `server` / `watch` /
 *                `immediate` / `key` / `query` / `method` / `body` …）
 */
export function useApiFetch<T>(
  url: string | (() => string),
  options: Omit<UseFetchOptions<ApiSuccess<T>>, '$fetch' | 'transform'> = {},
) {
  const client = useApiClient()

  const result = useFetch<ApiSuccess<T>>(url, {
    ...options,
    // 使用我們封裝過的實例：SSR cookie 轉發、CSRF、錯誤正規化都在裡面
    $fetch: client,
  } as UseFetchOptions<ApiSuccess<T>>)

  const enhanced = {
    /**
     * 已拆封的資料（信封中的 `data` 欄位）。尚未載入或發生錯誤時為 `null`。
     */
    data: computed<T | null>(() => result.data.value?.data ?? null),

    /**
     * 回應的中繼資訊，含 `requestId` 與 `timestamp`。
     * 錯誤回報時把 requestId 顯示給使用者，就能直接對應到 server log。
     */
    meta: computed(() => result.data.value?.meta ?? null),

    /** 分頁資訊。非列表型端點為 `null`。 */
    pagination: computed<Pagination | null>(() => result.data.value?.meta.pagination ?? null),

    /**
     * 正規化後的錯誤物件。永遠是 `ApiError`，可直接讀 `code` / `fieldErrors`。
     */
    error: computed<ApiError | null>(() =>
      result.error.value ? ApiError.from(result.error.value) : null,
    ),

    /** 是否正在載入（首次載入與 refresh 都會是 true）。 */
    pending: computed(() => result.status.value === 'pending'),

    /** 細部狀態：`'idle' | 'pending' | 'success' | 'error'`。 */
    status: result.status,

    /** 重新發送請求（會顯示 pending）。 */
    refresh: result.refresh,

    /** 手動觸發（搭配 `immediate: false` 使用）。 */
    execute: result.execute,

    /** 清除快取的資料與錯誤狀態。 */
    clear: result.clear,

    /**
     * 原始的 `useFetch` 回傳值（含未拆封的信封）。
     * 需要 `useFetch` 進階功能時使用，一般情況用不到。
     */
    raw: result,
  }

  /**
   * 回傳值同時是「物件」也是「Promise」，兩種寫法都支援：
   *
   * ```ts
   * const { data } = useApiFetch('/demo/list')          // 不等待，用 pending 控制畫面
   * const { data } = await useApiFetch('/demo/list')    // 等資料到齊才繼續往下
   * ```
   *
   * 這一點很重要：`await` 的版本會讓 Vue 的 `<Suspense>` 等待資料，
   * SSR 才能產出「已經有資料」的 HTML。少了這層，`await` 會立刻通過，
   * 伺服器端渲染出來的會是空畫面。Nuxt 原生的 `useFetch` 也是同樣的設計。
   */
  return Object.assign(
    result.then(() => enhanced),
    enhanced,
  ) as Promise<typeof enhanced> & typeof enhanced
}
