import type { Logger } from 'pino'
import type { PublicUser } from '../../shared/schemas/auth'

/**
 * 擴充 h3 的 `event.context` 型別。
 *
 * 這些欄位由 `server/middleware/*` 注入，宣告後全 server 端都有型別提示與自動補全。
 */
declare module 'h3' {
  interface H3EventContext {
    /** 本次請求的唯一識別碼。由 `00.request-context.ts` 注入。 */
    requestId: string
    /** 已綁定 requestId 的 child logger。由 `00.request-context.ts` 注入。 */
    logger: Logger
    /** 請求進入時的高解析度時間戳（`performance.now()`），用於計算 durationMs。 */
    startTime: number
    /**
     * 目前登入的使用者。由 `server/utils/session.ts` 的 `requireUser()` 注入，
     * 未登入時為 `undefined`。
     */
    user?: PublicUser
  }
}

export {}
