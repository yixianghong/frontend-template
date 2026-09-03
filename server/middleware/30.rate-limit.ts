import { defineEventHandler, getRequestHeader, getRequestIP, setResponseHeaders } from 'h3'
import { useRateLimitStorage } from '../utils/storage'
import { AppError, ERROR_CODE } from '../utils/errors'

/**
 * 流量限制（固定時間窗計數）。
 *
 * ## 防的是什麼
 * - 暴力破解登入密碼
 * - 爬蟲把上游 API 的配額吃光
 * - 單一用戶端意外的無限迴圈把服務打掛
 *
 * ## 演算法選擇
 * 這裡用最簡單的「固定時間窗（fixed window）」：每個 IP 在每個時間窗內
 * 有固定的請求配額。缺點是窗口交界處可能出現兩倍瞬時流量
 * （例如 59 秒打 100 次、61 秒又打 100 次）。
 *
 * 對一般業務系統這個精度已經夠用。若需要更平滑的限流，可改成滑動視窗或
 * token bucket —— 只要改這個檔案，其他地方不受影響。
 *
 * ## 多實例部署注意
 * 計數存在 `useRateLimitStorage()`，預設是 memory driver，
 * 每個 Pod 各自計數，實際限額會變成「設定值 × Pod 數」。
 * 正式環境請在 `nuxt.config.ts` 把 `ratelimit` storage 換成 Redis。
 */
export default defineEventHandler(async (event) => {
  // 只限制 API 路由。頁面、JS/CSS 資源不該被算進來，否則正常瀏覽一個頁面
  // 就可能因為載入數十個資源而觸發限流。
  if (!event.path.startsWith('/api/')) return

  // health / ready 是給 K8s 探針用的，探針被限流會導致 Pod 被誤判為不健康而重啟
  if (event.path === '/api/health' || event.path === '/api/ready') return

  const config = useRuntimeConfig(event)
  const storage = useRateLimitStorage()

  const identifier = clientIdentifier(event)
  const windowMs = config.rateLimitWindowMs
  const limit = config.rateLimitMax

  // 把時間切成固定區塊，key 帶上區塊編號，舊區塊的 key 自然失效不需要清理
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs
  const key = `${identifier}:${windowStart}`

  const current = ((await storage.getItem<number>(key)) ?? 0) + 1
  await storage.setItem(key, current)

  const remaining = Math.max(0, limit - current)
  const resetSeconds = Math.ceil((windowStart + windowMs - Date.now()) / 1000)

  // 標準的 RateLimit header，讓用戶端能主動退讓而不是硬撞
  setResponseHeaders(event, {
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(resetSeconds),
  })

  if (current > limit) {
    setResponseHeaders(event, { 'Retry-After': String(resetSeconds) })
    event.context.logger?.warn(
      { identifier, path: event.path, count: current, limit },
      'rate limit exceeded',
    )
    throw new AppError(ERROR_CODE.RATE_LIMITED)
  }
})

/**
 * 決定「誰」該被限流。
 *
 * ⚠️ `x-forwarded-for` 是用戶端可偽造的 header。只有在**確定自己位於可信任的
 * 反向代理（ALB / Nginx / Cloudflare）之後**時才可以採信它，因為那些代理會
 * 覆寫掉用戶端偽造的值。若你的服務直接暴露在公網，請把這段拿掉、
 * 只使用 `getRequestIP(event)`。
 */
function clientIdentifier(event: Parameters<typeof getRequestIP>[0]): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for 格式是 "client, proxy1, proxy2"，第一個才是原始用戶端
    const clientIp = forwarded.split(',')[0]?.trim()
    if (clientIp) return clientIp
  }
  return getRequestIP(event, { xForwardedFor: false }) ?? 'unknown'
}
