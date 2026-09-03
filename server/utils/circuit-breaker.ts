/**
 * 斷路器（Circuit Breaker）。
 *
 * ## 解決什麼問題
 * 當上游 API 掛掉時，如果不做任何處理，每一個進來的請求都會傻傻地等到 timeout
 * 才失敗。在流量大的時候，這些卡住的請求會耗盡 Node 的連線與記憶體，
 * 造成「上游掛掉 → 我們也跟著掛掉」的連鎖故障（cascading failure）。
 *
 * 斷路器的做法是：連續失敗到一定次數後就「跳閘」，之後的請求**立即失敗**
 * 而不再實際發出，直到冷卻時間過後才放一個請求出去試探。
 *
 * ## 三個狀態
 * ```
 *            連續失敗 >= threshold
 *   closed ─────────────────────────> open
 *     ↑                                 │ 經過 resetTimeoutMs
 *     │                                 ↓
 *     └──── 試探成功 ──────────────  half-open
 *                                       │ 試探失敗
 *                                       └──> open（重新計時）
 * ```
 * - **closed**：正常放行。
 * - **open**：直接快速失敗，不打上游，給上游喘息空間。
 * - **half-open**：冷卻結束，放行一個請求試探上游是否恢復。
 *
 * ## 為什麼把時間來源做成可注入
 * `now` 參數讓單元測試能直接控制時間快轉，不需要真的 `sleep`，
 * 測試因此又快又穩定。見 `tests/unit/circuit-breaker.test.ts`。
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** 連續失敗幾次後跳閘。 */
  failureThreshold: number
  /** 跳閘後隔多久進入 half-open 試探。 */
  resetTimeoutMs: number
  /** 時間來源，預設 `Date.now`。測試時可注入假時鐘。 */
  now?: () => number
}

export class CircuitBreaker {
  private failureCount = 0
  private openedAt = 0
  private halfOpenInFlight = false
  private readonly now: () => number

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now
  }

  /** 目前狀態。open 狀態超過冷卻時間會自動變成 half-open。 */
  get state(): CircuitState {
    if (this.failureCount < this.options.failureThreshold) return 'closed'
    if (this.now() - this.openedAt >= this.options.resetTimeoutMs) return 'half-open'
    return 'open'
  }

  /**
   * 是否允許發出請求。
   * half-open 狀態下只允許一個請求通過（試探），避免上游剛恢復就被打爆。
   */
  canAttempt(): boolean {
    const state = this.state
    if (state === 'closed') return true
    if (state === 'open') return false

    // half-open：只放行一個試探請求
    if (this.halfOpenInFlight) return false
    this.halfOpenInFlight = true
    return true
  }

  /** 記錄一次成功，重置所有計數（電路恢復 closed）。 */
  recordSuccess(): void {
    this.failureCount = 0
    this.openedAt = 0
    this.halfOpenInFlight = false
  }

  /** 記錄一次失敗。達到門檻時跳閘並開始計時。 */
  recordFailure(): void {
    this.halfOpenInFlight = false
    this.failureCount += 1
    if (this.failureCount >= this.options.failureThreshold) {
      this.openedAt = this.now()
    }
  }

  /** 手動重置，主要供測試與維運指令使用。 */
  reset(): void {
    this.recordSuccess()
  }

  /** 供監控端點輸出目前狀況。 */
  snapshot(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount }
  }
}

/** 依名稱共用的斷路器實例。同一個上游服務共用同一個電路。 */
const registry = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(name: string, options: CircuitBreakerOptions): CircuitBreaker {
  let breaker = registry.get(name)
  if (!breaker) {
    breaker = new CircuitBreaker(options)
    registry.set(name, breaker)
  }
  return breaker
}

/** 清空所有斷路器，僅供測試使用。 */
export function resetAllCircuitBreakers(): void {
  registry.clear()
}
