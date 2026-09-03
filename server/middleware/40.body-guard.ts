import { defineEventHandler, getRequestHeader } from 'h3'
import { AppError, ERROR_CODE } from '../utils/errors'
import { SAFE_METHODS } from '../../shared/constants/http'

/**
 * 請求主體防護：限制大小與內容型別。
 *
 * ## 為什麼需要
 * - **大小限制**：沒有上限的話，一個 500MB 的 POST 就能把 Node 的記憶體吃光
 *   （DoS）。在讀取 body 之前就先擋掉，成本最低。
 * - **型別白名單**：只接受預期的 Content-Type，可以擋掉一部分利用解析器差異
 *   的攻擊，也讓後續的 `readBody` 行為可預期。
 *
 * ## 上傳檔案的專案要注意
 * 預設沒有允許 `multipart/form-data`。若你的專案有檔案上傳需求，
 * 請把它加進 `ALLOWED_CONTENT_TYPES`，並針對上傳路由單獨設定較大的
 * `maxBodyBytes`（可用 `event.path` 判斷後略過這裡的通用限制）。
 */

/** 允許的 request body 內容型別。 */
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
]

export default defineEventHandler((event) => {
  // 安全方法（GET/HEAD/OPTIONS）沒有 body，不需要檢查
  if (SAFE_METHODS.includes(event.method as (typeof SAFE_METHODS)[number])) return

  const config = useRuntimeConfig(event)

  // --- 大小檢查 ---
  // ⚠️ 用戶端若使用 chunked transfer encoding 就不會送 content-length，
  // 這一關擋不到。它是「成本極低的第一道防線」，不是唯一防線 ——
  // 正式環境請同時在反向代理（Nginx 的 client_max_body_size、
  // ALB / Cloudflare 的 body size limit）設定硬上限。
  const contentLengthHeader = getRequestHeader(event, 'content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > config.maxBodyBytes) {
      event.context.logger?.warn(
        { contentLength, limit: config.maxBodyBytes, path: event.path },
        'request body too large',
      )
      throw new AppError(
        ERROR_CODE.PAYLOAD_TOO_LARGE,
        `傳送的資料超過上限（${Math.floor(config.maxBodyBytes / 1024)} KB）`,
      )
    }
  }

  // --- 型別檢查 ---
  const contentType = getRequestHeader(event, 'content-type')

  // 完全沒有 body 的 POST（例如 logout）不帶 Content-Type 是合法的。
  // 注意這裡判斷的是「有沒有 Content-Type」而不是「content-length 是否為 0」——
  // chunked encoding 的請求沒有 content-length，用長度判斷會讓型別檢查被整個跳過。
  if (!contentType) return

  // Content-Type 可能帶參數（`application/json; charset=utf-8`），取分號前那段比對
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  if (!ALLOWED_CONTENT_TYPES.includes(mediaType)) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, `不支援的內容型別：${mediaType || '(未指定)'}`)
  }
})
