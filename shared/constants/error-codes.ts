/**
 * 全站統一錯誤碼。
 *
 * 這份檔案位於 `shared/`，前端與 BFF（Nitro server）共用同一份定義，
 * 因此不會出現「後端回 A 碼、前端比對 B 碼」的漂移問題。
 *
 * 新增錯誤碼時只要在 `ERROR_CATALOG` 加一筆，型別與 HTTP 狀態碼會自動跟上。
 *
 * @example 前端判斷
 * ```ts
 * if (err.code === ERROR_CODE.UNAUTHORIZED) navigateTo('/login')
 * ```
 *
 * @example 後端拋出
 * ```ts
 * throw new AppError(ERROR_CODE.NOT_FOUND, '找不到這筆訂單')
 * ```
 */

/** 錯誤碼 → HTTP 狀態碼 + 預設訊息。單一事實來源，避免各處手寫 status code。 */
export const ERROR_CATALOG = {
  // --- 4xx 用戶端錯誤 ---
  /** 請求參數格式錯誤（zod 驗證失敗）。`details` 會帶上結構化的欄位錯誤。 */
  VALIDATION_ERROR: { status: 400, message: '請求參數有誤' },
  /** 請求本身格式不正確（JSON 解析失敗、Content-Type 不支援等）。 */
  BAD_REQUEST: { status: 400, message: '請求格式不正確' },
  /** 尚未登入，或 session 已過期。前端應導向登入頁。 */
  UNAUTHORIZED: { status: 401, message: '請先登入' },
  /** 已登入但權限不足。前端不應導向登入頁（導了也沒用）。 */
  FORBIDDEN: { status: 403, message: '沒有權限執行此操作' },
  /** CSRF token 缺失或不符。 */
  CSRF_INVALID: { status: 403, message: '安全性驗證失敗，請重新整理頁面' },
  /** 資源不存在。 */
  NOT_FOUND: { status: 404, message: '找不到指定的資源' },
  /** HTTP method 不被此路由支援。 */
  METHOD_NOT_ALLOWED: { status: 405, message: '不支援的請求方法' },
  /** 資源狀態衝突（例如重複建立、樂觀鎖失敗）。 */
  CONFLICT: { status: 409, message: '資料狀態衝突，請重新整理後再試' },
  /** 請求 body 超過大小上限。 */
  PAYLOAD_TOO_LARGE: { status: 413, message: '傳送的資料過大' },
  /** 觸發流量限制。回應會帶 `Retry-After` header。 */
  RATE_LIMITED: { status: 429, message: '請求過於頻繁，請稍後再試' },

  // --- 5xx 伺服器端錯誤 ---
  /** 未預期的內部錯誤。對外一律使用泛用訊息，真實原因只寫進 log。 */
  INTERNAL_ERROR: { status: 500, message: '系統發生錯誤，請稍後再試' },
  /** 外部 API 回傳錯誤，且無法對應到更精確的錯誤碼。 */
  UPSTREAM_ERROR: { status: 502, message: '外部服務暫時無法回應' },
  /** 服務尚未就緒（readiness 檢查失敗）或正在關閉中。 */
  SERVICE_UNAVAILABLE: { status: 503, message: '服務暫時無法使用' },
  /** 呼叫外部 API 逾時。 */
  UPSTREAM_TIMEOUT: { status: 504, message: '外部服務回應逾時' },
} as const

/** 所有可用錯誤碼的字面量聯集型別。 */
export type ErrorCode = keyof typeof ERROR_CATALOG

/**
 * 錯誤碼常數物件，提供 IDE 自動補全。
 * 用 `ERROR_CODE.NOT_FOUND` 而非字串 `'NOT_FOUND'`，打錯字時 TypeScript 會擋下來。
 */
export const ERROR_CODE = Object.fromEntries(Object.keys(ERROR_CATALOG).map((k) => [k, k])) as {
  [K in ErrorCode]: K
}

/** 取得某錯誤碼對應的 HTTP 狀態碼。 */
export function statusOf(code: ErrorCode): number {
  return ERROR_CATALOG[code].status
}

/** 取得某錯誤碼的預設中文訊息。 */
export function defaultMessageOf(code: ErrorCode): string {
  return ERROR_CATALOG[code].message
}
