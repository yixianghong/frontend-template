import { defineApiHandler } from '../../utils/handler'
import { requireUser } from '../../utils/session'

/**
 * 取得目前登入的使用者。
 *
 * 前端在 SSR 期間會呼叫它來還原登入狀態（見 `app/composables/useAuth.ts`）。
 * 未登入時回 401，前端據此決定要不要顯示登入按鈕或導向登入頁。
 *
 * 資料來源是加密 session cookie，不會產生任何外部 API 呼叫，所以很快。
 */
export default defineApiHandler(async (event) => {
  return await requireUser(event)
})
