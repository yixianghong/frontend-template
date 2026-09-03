import { z } from 'zod'

/**
 * 示範用的資料模型。
 *
 * 這裡同時示範一件重要的事：**上游 API 的回應也要驗證**。
 * `server/api/demo/*` 會用這個 schema 去 parse 外部 API 的回傳值，
 * 上游若偷改欄位，會在 BFF 就被擋下並記錄，而不是讓壞資料流到前端才炸。
 */
export const demoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.iso.datetime(),
})

export type DemoItem = z.infer<typeof demoItemSchema>

/** 上游列表端點的回應形狀。 */
export const demoListResponseSchema = z.object({
  items: z.array(demoItemSchema),
  total: z.number().int().nonnegative(),
})
