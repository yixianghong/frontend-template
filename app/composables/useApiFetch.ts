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
 * ---
 *
 * ## ⚠️ 跨頁快取：預設**不共用**，要共用得自己講（`revalidateOnEnter`）
 *
 * ### 為什麼需要這條規則
 * Nuxt 原生的 `useFetch` 依**呼叫位置**產生 key（編譯期依檔案與行號注入的
 * `autoKey`），所以兩個頁面各有各的快取。但這裡是個包裝函式，整個專案的
 * `useFetch` 只有下面這**一個**字面呼叫點 —— 只有一把 `autoKey`，key 因此
 * 退化成「只看網址」，**兩個讀同一支端點的頁面會共用同一筆 `useAsyncData`
 * 快取**。這是「把 `useFetch` 包起來」必然的副作用，不是誰寫錯了。
 *
 * 而 Nuxt 只在「沒有任何元件還在用它」（`_deps` 歸零）時才清快取。
 * 換頁時新頁面**先掛載、舊頁面才卸載**，所以在兩個共用同一把 key 的頁面之間
 * 來回走，`_deps` 永遠不會歸零 —— 快取不清，且因為 `status` 已經是 `success`，
 * Nuxt 直接沿用，**一次請求都不會發**（`nuxt/dist/app/composables/asyncData.js`
 * 的 `else if (opts.immediate && asyncData.status.value !== 'success')`）。
 *
 * 實際踩到的樣子：後台改完資料（PATCH 已經寫進資料庫），走到另一個也讀同一支
 * 端點的頁面再回來，畫面變回改之前的內容；要退回列表再進來才正確。更糟的是
 * 回來之後表單被舊資料灌回去，**再存一次就真的把新資料蓋掉**。
 *
 * ### 所以預設是「進到頁面就是新的」
 * `revalidateOnEnter` **預設為 `true`**，你不必為每支端點想這件事。
 * 它只在**確定這次呼叫一個請求都沒發**時才補抓（判斷見下面的表），所以：
 *
 * - 這一頁是唯一的讀取者 → 本來就會發請求 → **不多打**
 * - 整頁載入／hydration → 用 SSR 的 payload → **不多打**
 * - 沿用了別的頁面留下的快取 → **補抓一次**（就是上面那個 bug）
 *
 * 也就是說，**成本只發生在原本會出錯的那個情況**；同一頁裡多個元件讀同一支
 * 端點仍然只發一次請求（那本來就該共用）。
 *
 * ### 什麼時候該關掉
 * 只有一種：**掛在 layout 上、每一頁都要、而且幾乎不會變**的資料
 * （例如站台設定、隊名 Logo 這類東西）。那種資料的快取不會被清
 * （layout 不卸載），開著就變成每次換頁都多一個阻塞的來回。
 * 這種請一併給固定的 `key`，並在那裡寫明理由。
 *
 * 關掉之前先問一句：**這份資料在後台被改過之後，使用者會不會在不重新整理
 * 的情況下看到舊的？** 會的話就不該關。
 *
 * ### 試過但行不通的做法
 * - **每個呼叫點自己傳 key**：等於把「每次都要想」從端點層搬到呼叫層，
 *   而且寫錯或寫重複**不會有任何錯誤訊息**。
 * - **key 裡加上路由路徑**：layout 裡的 composable 會被綁在它第一次掛載的
 *   那個路由上，而且會默默破壞「刻意共用同一把 key」的設計。
 * - **`getCachedData: () => undefined`**：完全無效，而且更糟 —— 要不要重抓
 *   是在 `status !== 'success'` 那一行就決定了，`getCachedData` 根本還沒被問到；
 *   而傳了自訂的 `getCachedData` 會讓 Nuxt 的 `purgeCachedData && !hasCustomGetCachedData`
 *   失效，**連原本卸載時的清除都停掉**。
 *
 * @param url 端點路徑（相對於 `/api`），可傳字串或 getter 函式
 * @param options `useFetch` 的所有選項都支援（`lazy` / `server` / `watch` /
 *                `immediate` / `key` / `query` / `method` / `body` …），
 *                另外多一個 `revalidateOnEnter`（見上面，預設 `true`）
 */
export function useApiFetch<T>(
  url: string | (() => string),
  options: Omit<UseFetchOptions<ApiSuccess<T>>, '$fetch' | 'transform'> & {
    /**
     * 進到頁面時，如果這次呼叫沿用了別的頁面留下來的快取，就補抓一次。
     *
     * **預設 `true`。** 只有「掛在 layout 上、每頁都要、幾乎不會變」的資料
     * 才該關掉 —— 理由與判斷方式見上面的「跨頁快取」。
     */
    revalidateOnEnter?: boolean
  } = {},
) {
  const { revalidateOnEnter = true, ...fetchOptions } = options
  const client = useApiClient()

  const result = useFetch<ApiSuccess<T>>(url, {
    ...fetchOptions,
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

  /*
   * 要不要補抓一次。
   *
   * 這一行**必須是同步的**，因為它靠的是「`useFetch` 剛回來時的狀態」：
   *
   * | 同步讀到的狀態 | 意思 | 要不要補抓 |
   * | --- | --- | --- |
   * | `pending` | 這次呼叫真的發出了請求 | 不用 |
   * | `success` + `isHydrating` | SSR 的 payload，本來就是新的 | 不用 |
   * | `success` + 不在 hydrating | **沿用了別的頁面的快取，一次請求都沒發** | 要 |
   *
   * 三種情況都實測過。少了 `isHydrating` 這一項，每次整頁載入都會多打一次。
   */
  const staleFromAnotherPage =
    import.meta.client &&
    revalidateOnEnter &&
    !useNuxtApp().isHydrating &&
    result.status.value === 'success'

  /*
   * 補抓要**擋在 `await` 前面**，不能讓它在背景跑。
   *
   * 背景跑的話畫面會先畫出舊資料、幾百毫秒後才跳成新的；而表單類的頁面會在
   * 資料到齊時重新灌一次，使用者在那個空檔打的字就被蓋掉了。
   * 擋著的代價只是換頁慢一個來回 —— 和第一次打開這一頁的成本一樣。
   *
   * `catch` 是保險：`execute()` 目前會把錯誤收進 `error` 而不是丟出來，
   * 但這裡一旦丟出去就會變成整頁的錯誤畫面，不值得賭。
   */
  const settled = staleFromAnotherPage
    ? result.refresh().catch(() => {})
    : (result as Promise<unknown>)

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
    settled.then(() => enhanced),
    enhanced,
  ) as Promise<typeof enhanced> & typeof enhanced
}
