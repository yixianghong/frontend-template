import { defineEventHandler, getRequestHeader, setResponseHeader } from 'h3'
import { logger } from '../utils/logger'
import { REQUEST_ID_HEADER } from '../../shared/constants/http'

/**
 * 為每個請求建立追蹤情境。**必須是第一個執行的 middleware。**
 *
 * Nitro 的 server middleware 依**檔名字母序**執行，所以這裡用數字前綴
 * （`00.` → `10.` → `20.` …）來明確控制順序。後面的 middleware 都會用到
 * 這裡注入的 `event.context.logger`，順序錯了就沒有 log 可看。
 *
 * ## 做兩件事
 * 1. 產生 / 沿用 `requestId`，注入 context 並回寫到 response header。
 * 2. 建立綁定該 requestId 的 child logger。
 *
 * 之後同一次請求中的每一行 log 都會自動帶上這個 ID，包含 BFF 對外部 API 的
 * 呼叫紀錄。使用者回報問題時提供畫面上的 requestId，就能撈出完整軌跡。
 */
export default defineEventHandler((event) => {
  const incoming = getRequestHeader(event, REQUEST_ID_HEADER)

  // 沿用上游傳入的 ID 可以串起跨服務追蹤，但**不能無條件信任外部輸入** ——
  // 未經檢查的 header 會被拿來做 log injection（塞入換行偽造 log 行）。
  const requestId = isSafeRequestId(incoming) ? incoming : crypto.randomUUID()

  event.context.requestId = requestId
  event.context.startTime = performance.now()
  event.context.logger = logger.child({ requestId })

  // 回寫給前端，錯誤畫面上可以顯示它讓使用者回報
  setResponseHeader(event, REQUEST_ID_HEADER, requestId)
})

/** 只接受合理長度的英數與連字號，杜絕換行等控制字元。 */
function isSafeRequestId(value: string | undefined): value is string {
  return typeof value === 'string' && value.length <= 128 && /^[\w-]+$/.test(value)
}
