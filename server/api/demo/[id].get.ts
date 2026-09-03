import { defineApiHandler } from '../../utils/handler'
import { validateParams, validateUpstream } from '../../utils/validate'
import { upstreamFetch } from '../../utils/upstream'
import { AppError, ERROR_CODE } from '../../utils/errors'
import { idParamSchema } from '../../../shared/schemas/common'
import { demoItemSchema } from '../../../shared/schemas/demo'
import { DEMO_ITEMS } from '../../utils/demo-data'

/**
 * 單筆查詢 —— 示範動態路由參數與 404 的處理方式。
 *
 * 檔名 `[id].get.ts` 中的 `[id]` 會成為路由參數，`.get` 表示只接受 GET。
 * 用 `.get` / `.post` 後綴的好處是：對其他方法會自動回 405，
 * 不需要在 handler 裡自己判斷 `event.method`。
 */
export default defineApiHandler(async (event) => {
  const { id } = await validateParams(event, idParamSchema)
  const config = useRuntimeConfig(event)

  // ⚠️ ---------- DEMO 模式：正式專案請整段刪除 ----------
  if (!config.apiBaseUrl) {
    const item = DEMO_ITEMS.find((entry) => entry.id === id)
    // 直接 throw，defineApiHandler 會轉成統一的 404 錯誤格式
    if (!item) throw new AppError(ERROR_CODE.NOT_FOUND, `找不到編號 ${id} 的項目`)
    return item
  }
  // ⚠️ ---------- DEMO 模式結束 ----------

  // 上游若回 404，upstream.ts 的 mapUpstreamError 會自動轉成我們的 NOT_FOUND，
  // 所以這裡不需要特別處理 —— 但訊息會是預設的泛用文案。
  // 想要客製訊息就自己 catch，如下：
  try {
    const raw = await upstreamFetch(event, `/items/${encodeURIComponent(id)}`)
    return validateUpstream(event, demoItemSchema, raw, `GET /items/${id}`)
  } catch (err) {
    if (err instanceof AppError && err.code === ERROR_CODE.NOT_FOUND) {
      throw new AppError(ERROR_CODE.NOT_FOUND, `找不到編號 ${id} 的項目`)
    }
    throw err
  }
})
