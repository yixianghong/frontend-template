import { z } from 'zod'

/** 登入表單。前端可直接拿來做 client 端即時驗證，後端用同一份做最終驗證。 */
export const loginSchema = z.object({
  email: z.email('請輸入有效的電子郵件'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * 可以安全暴露給前端的使用者資料。
 *
 * 注意這裡**沒有** token 欄位 —— 那是刻意的。
 * upstream 的 access token 只會存在 BFF 的加密 session cookie 裡，
 * 永遠不會出現在任何回傳給瀏覽器的 JSON 中。
 */
export const publicUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  roles: z.array(z.string()).default([]),
})

export type PublicUser = z.infer<typeof publicUserSchema>
