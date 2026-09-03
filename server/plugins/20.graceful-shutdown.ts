import { logger } from '../utils/logger'
import { markShuttingDown } from '../utils/lifecycle'

/**
 * 優雅關閉（graceful shutdown）。
 *
 * ## 要解決的問題
 * 滾動更新時，Kubernetes 會對舊 Pod 送 `SIGTERM`。如果程序收到訊號就立刻退出，
 * 那些**正在處理中的請求會直接斷線**，使用者看到的是 502。
 *
 * ## 正確的關閉順序
 * ```
 * 1. 收到 SIGTERM
 * 2. /api/ready 立刻改回 503        ← 負載平衡器據此把本實例移出輪詢
 * 3. 等待 drain 時間（讓 LB 反應過來，且處理完手上的請求）
 * 4. 關閉 server、釋放連線池
 * 5. 程序退出
 * ```
 *
 * 關鍵在第 2、3 步：**先讓自己「不健康」，再等一段時間**。
 * 直接關閉會導致 LB 還在往這裡送流量時服務就沒了。
 *
 * ## 搭配的 K8s 設定
 * ```yaml
 * terminationGracePeriodSeconds: 30   # 必須大於 SHUTDOWN_DRAIN_MS
 * readinessProbe:
 *   httpGet: { path: /api/ready, port: 3000 }
 *   periodSeconds: 5
 * livenessProbe:
 *   httpGet: { path: /api/health, port: 3000 }
 * ```
 */

/** 標記為不健康後，等待負載平衡器把流量移走的時間。 */
const DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS ?? 10_000)

export default defineNitroPlugin((nitroApp) => {
  let handled = false

  const shutdown = async (signal: string) => {
    // 重複的訊號（例如使用者連按兩次 Ctrl+C）不要重複執行關閉流程
    if (handled) return
    handled = true

    logger.info({ signal, drainMs: DRAIN_MS }, 'received shutdown signal, draining traffic')

    // 步驟 2：立刻對外宣告「我不再接受新流量」
    markShuttingDown()

    // 步驟 3：給負載平衡器反應時間，同時讓進行中的請求跑完
    await new Promise((resolve) => setTimeout(resolve, DRAIN_MS))

    logger.info('drain complete, closing server')

    try {
      // 步驟 4：觸發 Nitro 的 close hook，讓資料庫連線池等資源有機會收尾
      await nitroApp.hooks.callHook('close')
    } catch (err) {
      logger.error({ err }, 'error during shutdown hook')
    }

    // 確保緩衝中的 log 都寫出去後才真正退出
    logger.flush?.()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // 未攔截的例外／未處理的 Promise rejection：記錄後讓程序退出。
  // 不要嘗試「繼續跑下去」—— 此時程序狀態已不可信，讓編排系統重啟一個乾淨的實例更安全。
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception, exiting')
    logger.flush?.()
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandled promise rejection, exiting')
    logger.flush?.()
    process.exit(1)
  })
})
