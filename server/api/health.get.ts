import { defineApiHandler } from '../utils/handler'
import { startedAt } from '../utils/lifecycle'

/**
 * Liveness probe —— 「這個程序還活著嗎？」
 *
 * ## 與 /api/ready 的差別（很重要，不要搞混）
 * | | `/api/health`（liveness） | `/api/ready`（readiness） |
 * |---|---|---|
 * | 問題 | 程序是否還能回應？ | 現在能不能接流量？ |
 * | 檢查外部依賴 | **不檢查** | 檢查 |
 * | 失敗時 K8s 的動作 | **重啟 Pod** | 把 Pod 移出負載平衡輪詢 |
 *
 * liveness **絕對不可以**檢查資料庫或上游 API。理由：資料庫短暫抖動時，
 * 所有 Pod 的 liveness 會同時失敗 → K8s 同時重啟全部 Pod → 服務完全中斷，
 * 而且重啟也解決不了資料庫的問題。這是很常見且代價高昂的設定錯誤。
 *
 * 所以這個端點只要能回應，就代表 Node 事件迴圈沒有被卡死，這樣就夠了。
 */
export default defineApiHandler(() => ({
  status: 'ok',
  uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
}))
