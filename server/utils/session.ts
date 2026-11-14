import { useSession, type H3Event } from 'h3'
import { AppError, ERROR_CODE } from './errors'
import { SESSION_COOKIE_NAME } from '../../shared/constants/http'
import type { PublicUser } from '../../shared/schemas/auth'

/**
 * BFF 的 Session 管理 —— 這是整個 BFF 架構最核心的安全價值所在。
 *
 * ## 核心原則：upstream token 永遠不離開 Node 層
 * 傳統 SPA 會把 access token 存在 localStorage 或前端可讀的 cookie，
 * 任何一個 XSS 就能把 token 偷走。BFF 模式改成：
 *
 * ```
 * 瀏覽器 ──(httpOnly 加密 cookie)──> Node BFF ──(Authorization: Bearer …)──> 外部 API
 *          ↑ 前端 JS 讀不到                      ↑ token 只存在這一段
 * ```
 *
 * token 存在 h3 的 **sealed session cookie** 中（加密 + 簽章），
 * 瀏覽器拿到的只是一串密文，前端 JavaScript 因為 httpOnly 也完全讀不到。
 * 就算發生 XSS，攻擊者也偷不走 token，最多只能在使用者的瀏覽器上發請求
 * （這部分由 CSRF 與 SameSite 防護）。
 *
 * ## Session 內容
 * 見 `AppSessionData`。注意所有欄位都只在 server 端存取，
 * 回傳給前端的永遠只有 `PublicUser`（不含任何 token）。
 */

/**
 * 開發環境用的臨時 session 密鑰。
 *
 * 讓剛 clone 下來、還沒建立 `.env` 的專案也能直接 `pnpm dev` 並登入測試。
 * 每次啟動都會重新產生，所以重啟後既有的登入狀態會失效 —— 開發時可以接受。
 *
 * production 一律為空字串：那裡缺少密鑰時，`server/plugins/00.env-validate.ts`
 * 會在啟動階段就讓程序退出，絕不會用到臨時密鑰。
 */
const DEV_FALLBACK_PASSWORD =
  process.env.NODE_ENV === 'production'
    ? ''
    : crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')

/** 存在加密 session cookie 中的資料。**絕不可直接回傳給前端。** */
export interface AppSessionData {
  /** 可公開的使用者資料。 */
  user?: PublicUser
  /** 外部 API 的 access token。只在 `upstream.ts` 中使用。 */
  accessToken?: string
  /** 外部 API 的 refresh token，用於自動續期。 */
  refreshToken?: string
  /** access token 的到期時間（epoch ms），用於判斷是否需要 refresh。 */
  accessTokenExpiresAt?: number
}

/** 取得（或初始化）本次請求的 session。 */
export async function useAppSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  const isProduction = process.env.NODE_ENV === 'production'

  return useSession<AppSessionData>(event, {
    // 用於加密 session 內容的密鑰，長度至少 32 字元。
    // production 缺少時，`server/plugins/00.env-validate.ts` 會在啟動階段讓程序退出；
    // 開發環境則退回本次啟動產生的臨時密鑰。
    password: config.sessionPassword || DEV_FALLBACK_PASSWORD,
    name: SESSION_COOKIE_NAME,
    maxAge: config.sessionMaxAge,
    cookie: {
      httpOnly: true, // 前端 JS 讀不到 —— 抵禦 XSS 竊取
      // localhost 是 http，dev 環境設 secure 會導致 cookie 完全不寫入
      secure: isProduction,
      sameSite: 'lax', // 抵禦大部分 CSRF；同時允許從外部連結導回時仍保有登入狀態
      path: '/',
    },
  })
}

/**
 * 建立登入 session。
 *
 * @example
 * ```ts
 * // server/api/auth/login.post.ts
 * const { user, accessToken } = await upstreamLogin(credentials)
 * await createUserSession(event, { user, accessToken })
 * return user   // 只回傳使用者資料，token 留在 server
 * ```
 */
export async function createUserSession(
  event: H3Event,
  payload: {
    user: PublicUser
    accessToken: string
    refreshToken?: string
    expiresInSeconds?: number
  },
): Promise<void> {
  const session = await useAppSession(event)

  await session.update({
    user: payload.user,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpiresAt: payload.expiresInSeconds
      ? Date.now() + payload.expiresInSeconds * 1000
      : undefined,
  })

  event.context.user = payload.user
}

/**
 * 清除 session（登出）。
 *
 * CSRF secret cookie 刻意保留：它綁的是「這個瀏覽器」而不是登入狀態，
 * 清掉反而會讓頁面上的 token 失效，登出後馬上再登入就會被擋。
 */
export async function clearUserSession(event: H3Event): Promise<void> {
  const session = await useAppSession(event)
  await session.clear()
  event.context.user = undefined
}

/**
 * 取得目前登入的使用者，未登入回傳 `null`。
 *
 * 適合用在「登入與否都能運作，只是內容不同」的端點。
 */
export async function getSessionUser(event: H3Event): Promise<PublicUser | null> {
  const session = await useAppSession(event)
  return session.data.user ?? null
}

/**
 * 要求必須登入，否則拋出 401。
 *
 * 順便把使用者掛到 `event.context.user`，後續程式碼可直接取用。
 *
 * @example
 * ```ts
 * export default defineApiHandler(async (event) => {
 *   const user = await requireUser(event)
 *   return { greeting: `你好，${user.name}` }
 * })
 * ```
 */
export async function requireUser(event: H3Event): Promise<PublicUser> {
  const user = await getSessionUser(event)
  if (!user) throw new AppError(ERROR_CODE.UNAUTHORIZED)
  event.context.user = user
  return user
}

/**
 * 要求使用者具備指定角色之一，否則拋出 403。
 *
 * @example
 * ```ts
 * await requireRole(event, ['admin', 'editor'])
 * ```
 */
export async function requireRole(event: H3Event, roles: string[]): Promise<PublicUser> {
  const user = await requireUser(event)
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new AppError(ERROR_CODE.FORBIDDEN)
  }
  return user
}

/**
 * 取出 upstream access token。**只應在 `server/utils/upstream.ts` 中呼叫。**
 *
 * 刻意不 export 給端點直接使用，避免有人不小心把 token 放進回應。
 */
export async function getUpstreamToken(event: H3Event): Promise<string | null> {
  const session = await useAppSession(event)
  return session.data.accessToken ?? null
}
