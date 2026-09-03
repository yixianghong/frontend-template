import type { MaybeRefOrGetter } from 'vue'
import type { DemoItem } from '#shared/schemas/demo'

/**
 * 「示範項目」這個功能領域的所有 API 呼叫。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ## 這一層存在的理由
 *
 * **頁面不該直接寫端點路徑。** 對照一下：
 *
 * ```ts
 * // ❌ 端點散落在各個頁面
 * // pages/demo/index.vue
 * const { data } = useApiFetch<DemoItem[]>('/demo/list', { query: { page } })
 * // pages/demo/[id].vue
 * const { data } = await useApiFetch<DemoItem>(() => `/demo/${route.params.id}`)
 * // pages/dashboard.vue
 * const { data } = useApiFetch<DemoItem[]>('/demo/list', { query: { page: 1 } })
 *
 * // ✅ 收斂到一支 composable
 * const { data } = useDemoItems({ page })
 * const { data } = await useDemoItem(id)
 * ```
 *
 * 差別在後端改路徑、加必填參數、換分頁欄位名稱的時候：
 * 前者要翻遍所有頁面找字串，還很容易漏掉；後者只改這個檔案。
 *
 * 附帶的好處：
 * - **型別只寫一次**：頁面不必每次都手動標 `<DemoItem[]>`
 * - **參數有預設值**：`pageSize` 之類的預設集中在這裡，不會各頁不一致
 * - **好測試**：可以只測這一層，不必為了測 API 邏輯而掛載整個頁面
 *
 * ## 命名慣例
 *
 * | 前綴 | 底層 | 什麼時候用 |
 * |---|---|---|
 * | `useXxxs()` / `useXxx()` | `useApiFetch`（宣告式） | 進頁面就要有的資料，SSR |
 * | `useXxxActions()` | `useApi`（命令式） | 使用者按了才發生的操作 |
 *
 * 分成兩種是因為底層機制不同：宣告式的必須在 `setup` 中呼叫、會參與 SSR；
 * 命令式的可以在任何時候呼叫。混在同一個 composable 裡會讓使用者搞不清楚
 * 哪些能在事件處理函式中用。
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * 端點路徑集中定義。
 *
 * 這是整個檔案唯一出現路徑字串的地方 —— 後端改路徑時只要改這裡。
 */
const ENDPOINTS = {
  list: '/demo/list',
  detail: (id: string) => `/demo/${encodeURIComponent(id)}`,
} as const

/** 列表的預設每頁筆數。各頁沒指定時一律用這個值，避免不同頁面不一致。 */
const DEFAULT_PAGE_SIZE = 20

/**
 * 【宣告式】取得示範項目列表。
 *
 * 進頁面就會自動載入，SSR 時在伺服器端取好寫進 payload，瀏覽器不會重打。
 * 傳入 ref 的話，值改變時會自動重新載入。
 *
 * @example 基本用法
 * ```vue
 * <script setup lang="ts">
 * const { data: items, pending, error } = useDemoItems()
 * </script>
 * ```
 *
 * @example 分頁（page 改變時自動重抓）
 * ```vue
 * <script setup lang="ts">
 * const page = ref(1)
 * const { data: items, pagination } = useDemoItems({ page, pageSize: 6 })
 * </script>
 * ```
 *
 * @example 等資料到齊才渲染（SSR 會輸出含資料的 HTML）
 * ```ts
 * const { data: items } = await useDemoItems()
 * ```
 */
export function useDemoItems(
  options: {
    page?: MaybeRefOrGetter<number>
    pageSize?: MaybeRefOrGetter<number>
  } = {},
) {
  // 包成 computed 才能保留響應性：直接 toValue() 會取到當下的值而斷開追蹤，
  // 之後 page 再變也不會重新載入。
  const page = computed(() => toValue(options.page) ?? 1)
  const pageSize = computed(() => toValue(options.pageSize) ?? DEFAULT_PAGE_SIZE)

  return useApiFetch<DemoItem[]>(ENDPOINTS.list, {
    query: { page, pageSize },
  })
}

/**
 * 【宣告式】取得單一示範項目。
 *
 * @param id 項目 ID。可傳字串、ref 或 getter；傳 getter 時路由參數改變會自動重抓。
 *
 * @example 動態路由
 * ```vue
 * <script setup lang="ts">
 * const route = useRoute()
 * const { data: item, error } = await useDemoItem(() => String(route.params.id))
 * </script>
 * ```
 */
export function useDemoItem(id: MaybeRefOrGetter<string>) {
  // url 傳 getter 函式而非字串，`useApiFetch` 才會在 id 改變時重新請求
  return useApiFetch<DemoItem>(() => ENDPOINTS.detail(String(toValue(id))))
}

/**
 * 【命令式】使用者操作觸發的示範項目相關請求。
 *
 * 回傳的 `loading` / `error` 是這個實例專屬的。若同一個頁面有多個彼此獨立的
 * 操作（例如「儲存」與「刪除」各要一個 loading），就呼叫多次取得多個實例。
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { fetchItem, loading, error } = useDemoActions()
 *
 * async function preview(id: string) {
 *   selected.value = await fetchItem(id)
 * }
 * </script>
 * ```
 *
 * @example 新增寫入類操作時照這個形狀擴充
 * ```ts
 * export function useDemoActions() {
 *   const { get, post, patch, del, loading, error, attempt } = useApi()
 *
 *   return {
 *     loading,
 *     error,
 *     attempt,
 *     fetchItem: (id: string) => get<DemoItem>(ENDPOINTS.detail(id)),
 *     createItem: (payload: DemoItemInput) => post<DemoItem>(ENDPOINTS.list, payload),
 *     updateItem: (id: string, payload: Partial<DemoItemInput>) =>
 *       patch<DemoItem>(ENDPOINTS.detail(id), payload),
 *     removeItem: (id: string) => del(ENDPOINTS.detail(id)),
 *   }
 * }
 * ```
 * 對應的 BFF 端點請一併建在 `server/api/demo/` 底下。
 */
export function useDemoActions() {
  const { get, loading, error, attempt } = useApi()

  return {
    /** 是否有請求進行中。 */
    loading,
    /** 最近一次失敗的錯誤（`ApiError`）。每次新請求開始時會清空。 */
    error,
    /** 不拋例外的包裝，回傳 `{ data, error }`。 */
    attempt,

    /**
     * 取得單一項目。
     *
     * 與 `useDemoItem()` 的差別：這支是**命令式**的，適合在事件處理函式中呼叫；
     * `useDemoItem()` 是宣告式、會參與 SSR，適合當作頁面資料。
     */
    fetchItem: (id: string) => get<DemoItem>(ENDPOINTS.detail(id)),
  }
}
