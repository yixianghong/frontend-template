import { defineEventHandler } from 'h3'
import { AppError, ERROR_CODE } from '../utils/errors'

/**
 * 擋下 production 環境的 demo API。
 *
 * ## 為什麼前後端要分開擋
 * 前端的 demo 頁面是在**建置期**就被移除的（見 `nuxt.config.ts` 的
 * `pages:extend`），程式碼根本不會進 bundle。但 `server/api/demo/**` 的
 * 端點仍然存在於產出中 —— Nitro 的路由是掃描檔案系統決定的，不像頁面那樣
 * 可以在建置期抽掉。所以這裡補一道執行期的守衛。
 *
 * 回 404 而不是 403，是因為「這個端點在這個環境不存在」比
 * 「存在但你沒權限」更貼近事實，也不會洩漏 production 有哪些隱藏端點。
 *
 * ## 刪除 demo 之後
 * 開新專案刪掉 `server/api/demo/` 時，這個檔案也可以一併刪除。
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/demo')) return

  const config = useRuntimeConfig(event)
  if (config.public.demoEnabled) return

  event.context.logger?.warn({ path: event.path }, 'demo API blocked outside development')
  throw new AppError(ERROR_CODE.NOT_FOUND)
})
