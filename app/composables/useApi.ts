import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'
import type { ApiMeta, ApiSuccess } from '#shared/types/api'
import { ApiError } from '~/utils/api-error'

/** `$fetch` 的完整選項。 */
type FetchOptions = NitroFetchOptions<NitroFetchRequest>

/** 單次請求可用的選項（拿掉 method —— 由各方法決定）。 */
type RequestOptions = Omit<FetchOptions, 'method' | 'baseURL'>

/** request body 可接受的型別，與 `$fetch` 一致。 */
type RequestBody = FetchOptions['body']

/**
 * 【呼叫方式 B：命令式】使用者操作時才發送，適合表單送出、刪除、載入更多。
 *
 * 這是 `$fetch` 的封裝，附帶 `loading` / `error` 狀態管理。
 *
 * ═══════════════════════════════════════════════════════════════════
 * ## ⚠️ 不要在 `<script setup>` 頂層直接呼叫它取初始資料
 *
 * ```ts
 * // ❌ 錯誤：SSR 抓一次、瀏覽器 hydration 又抓一次，資料抓兩次
 * const { get } = useApi()
 * const items = await get('/demo/list')
 *
 * // ✅ 正確：初始資料請用方式 A
 * const { data: items } = useApiFetch('/demo/list')
 * ```
 *
 * 方式 B 的正確用法是放在**事件處理函式**裡。
 * ═══════════════════════════════════════════════════════════════════
 *
 * ## 狀態管理
 * `loading` 用計數器實作，同時發多個請求時也能正確運作
 * （全部完成才會變回 `false`）。
 *
 * 若同一個元件內有多個不該互相干擾的操作（例如「儲存」和「刪除」各有自己的
 * loading 狀態），請呼叫多次 `useApi()` 取得互相獨立的實例：
 * ```ts
 * const saveApi = useApi()
 * const deleteApi = useApi()
 * ```
 *
 * ---
 *
 * @example 送出表單（最典型的用法）
 * ```vue
 * <script setup lang="ts">
 * const { post, loading, error } = useApi()
 * const form = reactive({ title: '', description: '' })
 *
 * async function submit() {
 *   try {
 *     const created = await post<DemoItem>('/demo/items', form)
 *     await navigateTo(`/demo/${created.id}`)
 *   } catch (err) {
 *     // error ref 已自動更新，這裡可以做額外處理（例如捲動到錯誤處）
 *     if (ApiError.from(err).code === 'VALIDATION_ERROR') scrollToFirstError()
 *   }
 * }
 * </script>
 *
 * <template>
 *   <form @submit.prevent="submit">
 *     <input v-model="form.title" :aria-invalid="!!error?.fieldErrors.title">
 *     <p v-if="error?.fieldErrors.title">{{ error.fieldErrors.title[0] }}</p>
 *     <button :disabled="loading">{{ loading ? '送出中…' : '送出' }}</button>
 *   </form>
 * </template>
 * ```
 *
 * @example 不想寫 try/catch —— 用 attempt() 取得結果物件
 * ```ts
 * const { attempt } = useApi()
 *
 * const { data, error } = await attempt(() => post('/demo/items', form))
 * if (error) return showToast(error.message)
 * showToast(`已建立 ${data.title}`)
 * ```
 *
 * @example 刪除並重新整理列表（與方式 A 搭配使用）
 * ```ts
 * const { data: items, refresh } = useApiFetch<DemoItem[]>('/demo/list')
 * const { del, loading: deleting } = useApi()
 *
 * async function remove(id: string) {
 *   await del(`/demo/${id}`)
 *   await refresh()          // 讓方式 A 重新取得列表
 * }
 * ```
 *
 * @example 載入更多（無限捲動）
 * ```ts
 * const { get } = useApi()
 * const items = ref<DemoItem[]>([])
 * const page = ref(1)
 *
 * async function loadMore() {
 *   const next = await get<DemoItem[]>('/demo/list', { query: { page: ++page.value } })
 *   items.value.push(...next)
 * }
 * ```
 */
export function useApi() {
  const client = useApiClient()

  // 用計數器而非 boolean：同時發三個請求時，第一個完成不會誤把 loading 關掉
  const pendingCount = ref(0)
  const error = ref<ApiError | null>(null)
  const lastMeta = ref<ApiMeta | null>(null)

  /**
   * 底層請求方法。一般直接用下面的 `get` / `post` / … 即可。
   *
   * 成功時回傳**已拆封的 data**（不是整個信封）；
   * 失敗時 `error` ref 會被更新，並拋出 `ApiError`。
   */
  async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    pendingCount.value += 1
    error.value = null

    try {
      const response = await client<ApiSuccess<T>>(path, options)
      lastMeta.value = response.meta
      return response.data
    } catch (err) {
      const apiError = ApiError.from(err)
      error.value = apiError
      throw apiError
    } finally {
      pendingCount.value -= 1
    }
  }

  /**
   * 執行請求但**不拋出例外**，改回傳結果物件。
   *
   * 適合不想寫 try/catch 的流程。注意 `data` 與 `error` 必定一個有值、一個為 null。
   */
  async function attempt<T>(
    fn: () => Promise<T>,
  ): Promise<{ data: T; error: null } | { data: null; error: ApiError }> {
    try {
      return { data: await fn(), error: null }
    } catch (err) {
      return { data: null, error: ApiError.from(err) }
    }
  }

  return {
    /** 是否有請求進行中。多個並行請求全部完成後才會變回 false。 */
    loading: computed(() => pendingCount.value > 0),

    /** 最近一次失敗的錯誤。每次新請求開始時會清空。 */
    error,

    /** 最近一次成功回應的 meta（含 requestId、pagination）。 */
    lastMeta,

    /** GET。查詢參數用 `{ query: { ... } }` 傳。 */
    get: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'GET' }),

    /** POST。第二個參數是 request body。 */
    post: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),

    /** PUT（完整取代）。 */
    put: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PUT', body }),

    /** PATCH（部分更新）。 */
    patch: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),

    /** DELETE。命名為 `del` 是因為 `delete` 是 JavaScript 保留字。 */
    del: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'DELETE' }),

    /** 需要自訂 method 或其他進階選項時使用。 */
    request,

    /** 不拋例外的包裝，見上方 `@example`。 */
    attempt,
  }
}
