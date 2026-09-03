import { defineApiHandler } from '../../utils/handler'
import { validateBody } from '../../utils/validate'
import { createUserSession } from '../../utils/session'
import { upstreamFetch } from '../../utils/upstream'
import { AppError, ERROR_CODE } from '../../utils/errors'
import { loginSchema, publicUserSchema, type PublicUser } from '../../../shared/schemas/auth'

/**
 * 登入。
 *
 * ## BFF 認證流程的核心
 * ```
 * 瀏覽器                    BFF (這裡)                     外部 Auth API
 *   │  POST /api/auth/login    │                                 │
 *   │  { email, password }     │                                 │
 *   ├─────────────────────────>│                                 │
 *   │                          │  POST /auth/login               │
 *   │                          ├────────────────────────────────>│
 *   │                          │  { accessToken, user }          │
 *   │                          │<────────────────────────────────┤
 *   │                          │                                 │
 *   │                          │ accessToken → 加密 session cookie
 *   │                          │ user        → 回應 body          │
 *   │  Set-Cookie: app_session=<加密密文>; HttpOnly              │
 *   │  { success: true, data: { id, email, name, roles } }        │
 *   │<─────────────────────────┤                                 │
 * ```
 *
 * **注意回應 body 裡沒有 token。** 這是刻意的，也是整個 BFF 架構的重點：
 * 前端拿到的只有一個讀不到內容的 httpOnly cookie，就算被 XSS 也偷不走 token。
 *
 * ## 防暴力破解
 * 這支端點被 `30.rate-limit.ts` 保護。正式環境建議針對登入再加嚴（例如
 * 依 email 而非 IP 計數、失敗達 N 次鎖定帳號），可在此處加上額外的計數邏輯。
 */
export default defineApiHandler(async (event) => {
  const credentials = await validateBody(event, loginSchema)

  const config = useRuntimeConfig(event)

  // ⚠️ ---------- DEMO 模式：正式專案請整段刪除 ----------
  // 讓這個樣板 clone 下來不用設定任何外部 API 就能跑起來、跑得動測試。
  // 只要設定了 NUXT_API_BASE_URL，就會走下方真正的上游呼叫。
  if (!config.apiBaseUrl) {
    event.context.logger.warn('apiBaseUrl 未設定，使用 demo 登入流程')
    return demoLogin(event, credentials.email, credentials.password)
  }
  // ⚠️ ---------- DEMO 模式結束 ----------

  // 呼叫外部認證服務。auth: false 是因為此時還沒有 token 可以帶。
  const result = await upstreamFetch<{
    accessToken: string
    refreshToken?: string
    expiresIn?: number
    user: unknown
  }>(event, '/auth/login', {
    method: 'POST',
    body: credentials,
    auth: false,
    // 認證失敗不該重試 —— 重試只會加速觸發上游的帳號鎖定
    retries: 0,
  })

  // 驗證上游回傳的使用者資料形狀，順便把多餘欄位（例如上游偷塞的內部欄位）濾掉，
  // 確保回給前端的只有 publicUserSchema 定義的欄位。
  const parsed = publicUserSchema.safeParse(result.user)
  if (!parsed.success) {
    event.context.logger.error(
      { issues: parsed.error.issues },
      'upstream login returned unexpected user shape',
    )
    throw new AppError(ERROR_CODE.UPSTREAM_ERROR)
  }

  await createUserSession(event, {
    user: parsed.data,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresInSeconds: result.expiresIn,
  })

  event.context.logger.info({ userId: parsed.data.id }, 'user logged in')

  // 只回傳可公開的使用者資料，token 留在 server 端
  return parsed.data
})

/** ⚠️ DEMO 用的假登入，正式專案請連同上方的 demo 分支一起刪除。 */
async function demoLogin(
  event: Parameters<typeof createUserSession>[0],
  email: string,
  password: string,
): Promise<PublicUser> {
  if (password !== 'password1234') {
    throw new AppError(ERROR_CODE.UNAUTHORIZED, '帳號或密碼錯誤')
  }

  const user: PublicUser = {
    id: 'demo-user-1',
    email,
    name: email.split('@')[0] ?? 'Demo User',
    roles: ['user'],
  }

  await createUserSession(event, {
    user,
    accessToken: 'demo-access-token',
    expiresInSeconds: 3600,
  })

  return user
}
