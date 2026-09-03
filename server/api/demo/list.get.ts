import { defineApiHandler } from '../../utils/handler'
import { validateQuery, validateUpstream } from '../../utils/validate'
import { apiPaginated } from '../../utils/response'
import { upstreamFetch } from '../../utils/upstream'
import { paginationQuerySchema } from '../../../shared/schemas/common'
import { demoListResponseSchema } from '../../../shared/schemas/demo'
import { paginateDemoItems } from '../../utils/demo-data'

/**
 * 分頁列表 —— 示範一支「標準端點」該長什麼樣。
 *
 * 這支端點示範了五件事，新端點照抄這個結構即可：
 * 1. `defineApiHandler` 包裝 → 自動統一成功／錯誤格式
 * 2. `validateQuery` 驗證輸入 → 髒資料進不了系統
 * 3. `upstreamFetch` 呼叫外部 API → 自動帶 token、逾時、重試、斷路
 * 4. `validateUpstream` 驗證上游回應 → 上游改欄位時在這裡就發現
 * 5. `apiPaginated` 回傳 → 分頁資訊自動算好放進 meta
 *
 * ## 想加快取？
 * 把 `defineApiHandler` 換成 Nitro 的 `defineCachedEventHandler`：
 * ```ts
 * export default defineCachedEventHandler(handler, {
 *   maxAge: 60,                                   // 快取 60 秒
 *   swr: true,                                    // 過期後先回舊資料再背景更新
 *   getKey: (event) => `demo:list:${getQuery(event).page ?? 1}`,
 * })
 * ```
 * ⚠️ 快取會**跨使用者共用**，只能用在與登入身分無關的公開資料上。
 * 與使用者相關的資料請改用 `server/utils/storage.ts` 的 `cached()` 並把
 * userId 放進 key。
 */
export default defineApiHandler(async (event) => {
  const { page, pageSize } = await validateQuery(event, paginationQuerySchema)
  const config = useRuntimeConfig(event)

  // ⚠️ ---------- DEMO 模式：正式專案請整段刪除 ----------
  if (!config.apiBaseUrl) {
    const { items, total } = paginateDemoItems(page, pageSize)
    return apiPaginated(event, items, { page, pageSize, total })
  }
  // ⚠️ ---------- DEMO 模式結束 ----------

  const raw = await upstreamFetch(event, '/items', {
    query: { page, limit: pageSize },
  })

  // 上游回應也要驗證：欄位被改、回了 null、型別變了，都在這裡攔下並記錄，
  // 而不是讓壞資料流到前端才在畫面上炸開。
  const data = validateUpstream(event, demoListResponseSchema, raw, 'GET /items')

  return apiPaginated(event, data.items, { page, pageSize, total: data.total })
})
