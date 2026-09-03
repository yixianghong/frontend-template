import { describe, expect, it } from 'vitest'
import { backoffDelay } from '../../server/utils/upstream'

describe('backoffDelay', () => {
  it('隨重試次數指數成長', () => {
    // 加了抖動所以是區間比較，不是固定值
    const first = backoffDelay(0, 200) // 200ms × [0.5, 1.5)
    const second = backoffDelay(1, 200) // 400ms × [0.5, 1.5)
    const third = backoffDelay(2, 200) // 800ms × [0.5, 1.5)

    expect(first).toBeGreaterThanOrEqual(100)
    expect(first).toBeLessThan(300)
    expect(second).toBeGreaterThanOrEqual(200)
    expect(second).toBeLessThan(600)
    expect(third).toBeGreaterThanOrEqual(400)
    expect(third).toBeLessThan(1200)
  })

  it('加入抖動 —— 同樣的參數不會每次都回傳一樣的值', () => {
    // 抖動的用意是避免大量失敗請求在同一瞬間一起重試，
    // 把剛要恢復的上游再次打掛（thundering herd）
    const samples = new Set(Array.from({ length: 30 }, () => backoffDelay(2, 200)))
    expect(samples.size).toBeGreaterThan(1)
  })
})
