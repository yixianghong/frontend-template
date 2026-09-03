import { beforeEach, describe, expect, it } from 'vitest'
import {
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from '../../server/utils/circuit-breaker'

/**
 * 斷路器測試。
 *
 * 重點示範：因為 `now` 是可注入的，測試可以「快轉時間」而不需要真的等待，
 * 整組測試在幾毫秒內跑完且完全穩定（不會有時序造成的隨機失敗）。
 */
describe('CircuitBreaker', () => {
  let clock: number

  const makeBreaker = () =>
    new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      now: () => clock,
    })

  beforeEach(() => {
    clock = 0
  })

  it('初始狀態為 closed 且允許請求', () => {
    const breaker = makeBreaker()
    expect(breaker.state).toBe('closed')
    expect(breaker.canAttempt()).toBe(true)
  })

  it('未達門檻的失敗不會跳閘', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()

    expect(breaker.state).toBe('closed')
    expect(breaker.canAttempt()).toBe(true)
  })

  it('連續失敗達門檻後跳閘並快速失敗', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()

    expect(breaker.state).toBe('open')
    expect(breaker.canAttempt()).toBe(false)
  })

  it('成功會重置計數，避免偶發失敗累積成跳閘', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    breaker.recordFailure()
    breaker.recordFailure()

    expect(breaker.state).toBe('closed')
  })

  it('冷卻時間過後自動進入 half-open', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.state).toBe('open')

    clock += 1000 // 快轉超過 resetTimeoutMs

    expect(breaker.state).toBe('half-open')
  })

  it('half-open 只放行一個試探請求', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    clock += 1000

    // 第一個請求可以通過（試探）
    expect(breaker.canAttempt()).toBe(true)
    // 同時間的第二個請求要被擋下，避免剛恢復的上游被打爆
    expect(breaker.canAttempt()).toBe(false)
  })

  it('試探成功後電路恢復 closed', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    clock += 1000
    breaker.canAttempt()
    breaker.recordSuccess()

    expect(breaker.state).toBe('closed')
    expect(breaker.canAttempt()).toBe(true)
  })

  it('試探失敗後重新跳閘並重新計時', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    clock += 1000
    breaker.canAttempt()
    breaker.recordFailure() // 試探也失敗

    expect(breaker.state).toBe('open')
    expect(breaker.canAttempt()).toBe(false)
  })

  it('snapshot 回報目前狀態，供 /api/ready 使用', () => {
    const breaker = makeBreaker()
    breaker.recordFailure()

    expect(breaker.snapshot()).toEqual({ state: 'closed', failureCount: 1 })
  })
})

describe('getCircuitBreaker', () => {
  beforeEach(() => resetAllCircuitBreakers())

  it('同一個名稱共用同一個電路實例', () => {
    const options = { failureThreshold: 3, resetTimeoutMs: 1000 }
    const a = getCircuitBreaker('payment', options)
    const b = getCircuitBreaker('payment', options)

    expect(a).toBe(b)
  })

  it('不同名稱彼此獨立 —— 一個上游掛掉不影響其他上游', () => {
    const options = { failureThreshold: 1, resetTimeoutMs: 1000 }
    const payment = getCircuitBreaker('payment', options)
    const inventory = getCircuitBreaker('inventory', options)

    payment.recordFailure()

    expect(payment.state).toBe('open')
    expect(inventory.state).toBe('closed')
  })
})
