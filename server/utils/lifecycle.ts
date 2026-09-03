/**
 * 程序生命週期狀態。
 *
 * 獨立成一個模組是為了讓 `/api/ready` 端點與 graceful shutdown plugin
 * 共用同一份狀態，而不需要互相 import 造成循環依賴。
 */

let shuttingDown = false

/** 標記程序正在關閉中。 */
export function markShuttingDown(): void {
  shuttingDown = true
}

/**
 * 程序是否正在關閉。
 * `/api/ready` 會據此回傳 503，讓負載平衡器停止送新流量進來。
 */
export function isShuttingDown(): boolean {
  return shuttingDown
}

/** 程序啟動時間，供 `/api/health` 回報 uptime。 */
export const startedAt = Date.now()
