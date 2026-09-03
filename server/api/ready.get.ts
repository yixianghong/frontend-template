import { setResponseStatus } from 'h3'
import { defineApiHandler } from '../utils/handler'
import { isShuttingDown } from '../utils/lifecycle'
import { useRateLimitStorage } from '../utils/storage'
import { getCircuitBreaker } from '../utils/circuit-breaker'
import { apiSuccess } from '../utils/response'

/**
 * Readiness probe —— 「現在可以把流量送進來嗎？」
 *
 * 回傳 503 時，Kubernetes 會把這個 Pod 從 Service 的輪詢中移除，
 * 但**不會**重啟它。等到狀況恢復、這裡回 200，流量才會回來。
 *
 * ## 檢查項目
 * 1. **是否正在關閉**：收到 SIGTERM 後立刻回 503，讓負載平衡器先停止送流量，
 *    這是 graceful shutdown 能運作的關鍵前提（見 `plugins/20.graceful-shutdown.ts`）。
 * 2. **storage 可用性**：rate limit 與快取都依賴它，掛了會影響所有請求。
 * 3. **上游斷路器狀態**：僅供參考不影響判定 —— 上游掛掉時我們仍應該接流量
 *    並回傳友善的錯誤訊息，把自己也下線只會讓使用者看到 502。
 */
export default defineApiHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const checks = {
    shuttingDown: isShuttingDown(),
    storage: await checkStorage(),
    upstreamCircuit: getCircuitBreaker('default', {
      failureThreshold: config.circuitBreakerThreshold,
      resetTimeoutMs: config.circuitBreakerResetMs,
    }).snapshot(),
  }

  const ready = !checks.shuttingDown && checks.storage === 'ok'

  if (!ready) {
    setResponseStatus(event, 503)
    event.context.logger?.warn({ checks }, 'readiness check failed')
  }

  // 這裡刻意用 apiSuccess 明確包裝：即使狀態是 503，回應的**格式**仍然是統一的，
  // 只是 data 裡的 ready 為 false。監控系統看 HTTP 狀態碼，人看 body 內容。
  return apiSuccess(event, { ready, checks })
})

async function checkStorage(): Promise<'ok' | 'error'> {
  try {
    const storage = useRateLimitStorage()
    await storage.setItem('__healthcheck__', Date.now())
    await storage.removeItem('__healthcheck__')
    return 'ok'
  } catch {
    return 'error'
  }
}
