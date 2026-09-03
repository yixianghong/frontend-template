import {
  ERROR_CODE,
  ERROR_CATALOG,
  defaultMessageOf,
  statusOf,
  type ErrorCode,
} from '../../shared/constants/error-codes'

/**
 * BFF 統一的錯誤型別。
 *
 * ## 設計重點
 * 所有「預期內」的錯誤都應該 `throw new AppError(...)`，而不是回傳錯誤物件。
 * 這樣做的好處是：不需要在每一層都檢查回傳值，錯誤會自動冒泡到
 * `defineApiHandler()` 的 try/catch，由它統一轉成標準錯誤格式。
 *
 * ## expose 的意義
 * `expose: true` 表示這個錯誤訊息**可以安全地顯示給終端使用者**。
 * 4xx 錯誤預設為 true（是使用者自己輸入錯了，該告訴他）；
 * 5xx 預設為 false（是我們的問題，細節只寫進 log，對外只給泛用訊息），
 * 避免把資料庫錯誤、內部服務位址之類的資訊洩漏出去。
 *
 * @example 基本用法
 * ```ts
 * throw new AppError(ERROR_CODE.NOT_FOUND)                    // 用預設訊息
 * throw new AppError(ERROR_CODE.NOT_FOUND, '找不到這筆訂單')   // 自訂訊息
 * ```
 *
 * @example 帶結構化細節（前端可據此標紅特定欄位）
 * ```ts
 * throw new AppError(ERROR_CODE.VALIDATION_ERROR, '表單有誤', {
 *   details: { email: '格式不正確' },
 * })
 * ```
 *
 * @example 包裝底層錯誤（保留原始 stack 供 log 使用）
 * ```ts
 * catch (err) {
 *   throw new AppError(ERROR_CODE.UPSTREAM_ERROR, undefined, { cause: err })
 * }
 * ```
 */
export class AppError extends Error {
  /** 機器可讀錯誤碼。 */
  readonly code: ErrorCode
  /** 對應的 HTTP 狀態碼，由錯誤碼自動推導。 */
  readonly statusCode: number
  /** 結構化細節，會放進回應的 `error.details`。 */
  readonly details?: unknown
  /** 訊息是否可安全顯示給使用者。 */
  readonly expose: boolean

  constructor(
    code: ErrorCode,
    message?: string,
    options: { details?: unknown; cause?: unknown; expose?: boolean } = {},
  ) {
    super(message ?? defaultMessageOf(code), { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusOf(code)
    this.details = options.details
    // 4xx 預設可揭露、5xx 預設不可揭露；可用 options.expose 明確覆寫。
    this.expose = options.expose ?? this.statusCode < 500

    // 讓 stack trace 指向真正 throw 的位置，而不是這個 constructor。
    Error.captureStackTrace?.(this, AppError)
  }
}

/** 型別守衛：判斷是否為我們自己拋出的 `AppError`。 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

/**
 * 把任意 thrown 值正規化成 `AppError`。
 *
 * 供 `defineApiHandler` 與 `server/error.ts` 兜底使用。處理三種情況：
 * 1. 已經是 `AppError` → 原樣返回。
 * 2. h3 的 `createError()` 產生的錯誤（帶 `statusCode`）→ 依狀態碼對應錯誤碼。
 * 3. 其他任何東西（原生 Error、字串、undefined）→ 一律轉成 `INTERNAL_ERROR`。
 */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err

  // h3 會把 middleware 拋出的錯誤包成 H3Error，原始錯誤放在 cause。
  // 一定要先把它找回來，否則資訊會流失：同一個 HTTP 狀態碼可能對應多個錯誤碼
  // （403 同時是 FORBIDDEN 和 CSRF_INVALID），單靠狀態碼反查會拿到錯的那個。
  const unwrapped = unwrapAppError(err)
  if (unwrapped) return unwrapped

  // h3 createError() 或其他帶 statusCode 的錯誤（例如 Nitro 內建的 404）
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const status = Number((err as { statusCode: unknown }).statusCode)
    const message =
      'statusMessage' in err && typeof err.statusMessage === 'string'
        ? err.statusMessage
        : err instanceof Error
          ? err.message
          : undefined
    return new AppError(codeFromStatus(status), status < 500 ? message : undefined, {
      cause: err,
    })
  }

  return new AppError(ERROR_CODE.INTERNAL_ERROR, undefined, { cause: err })
}

/**
 * 沿著 `cause` 鏈尋找原始的 `AppError`。
 *
 * 限制搜尋深度，避免遇到自我參照的 cause 造成無限迴圈。
 */
function unwrapAppError(err: unknown, depth = 0): AppError | null {
  if (depth > 5 || !err || typeof err !== 'object') return null
  if (isAppError(err)) return err
  if ('cause' in err) return unwrapAppError(err.cause, depth + 1)
  return null
}

/** HTTP 狀態碼 → 錯誤碼的反向對應。找不到精確對應時退回 4xx/5xx 的泛用碼。 */
function codeFromStatus(status: number): ErrorCode {
  const match = (Object.keys(ERROR_CATALOG) as ErrorCode[]).find(
    (code) => ERROR_CATALOG[code].status === status,
  )
  if (match) return match
  return status >= 500 ? ERROR_CODE.INTERNAL_ERROR : ERROR_CODE.BAD_REQUEST
}

export { ERROR_CODE }
export type { ErrorCode }
