import { z } from 'zod'

/**
 * 前後端共用的 zod schema。
 *
 * 放在 `shared/` 的用意：後端用它做**執行期驗證**，前端用 `z.infer` 取得
 * **編譯期型別**，兩邊永遠同步。改欄位只需要改這一個地方。
 */

/**
 * 分頁查詢參數。
 *
 * query string 進來一律是字串，所以用 `coerce` 轉型；
 * `pageSize` 設上限避免有人打 `?pageSize=999999` 拖垮上游服務。
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>
export type PaginationQueryOutput = z.output<typeof paginationQuerySchema>

/** 路由參數常見的 ID 形狀（非空字串）。 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID 不可為空'),
})
