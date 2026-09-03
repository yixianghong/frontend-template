import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { apiFailure, apiPaginated, apiSuccess } from '../../server/utils/response'
import { AppError } from '../../server/utils/errors'
import { ERROR_CODE } from '../../shared/constants/error-codes'

/** 建立最小可用的假 event —— response.ts 只會讀 context.requestId。 */
function fakeEvent(requestId = 'test-request-id'): H3Event {
  return { context: { requestId } } as unknown as H3Event
}

describe('apiSuccess', () => {
  it('包成統一信封並帶上 requestId', () => {
    const result = apiSuccess(fakeEvent('abc-123'), { name: 'Nuxt' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: 'Nuxt' })
    expect(result.meta.requestId).toBe('abc-123')
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('requestId 缺失時不會炸掉，改用 unknown', () => {
    const result = apiSuccess({ context: {} } as unknown as H3Event, null)
    expect(result.meta.requestId).toBe('unknown')
  })
})

describe('apiPaginated', () => {
  it('自動算出 totalPages 與 hasNext', () => {
    const result = apiPaginated(fakeEvent(), [1, 2, 3], { page: 1, pageSize: 3, total: 10 })

    expect(result.meta.pagination).toEqual({
      page: 1,
      pageSize: 3,
      total: 10,
      totalPages: 4,
      hasNext: true,
    })
  })

  it('最後一頁的 hasNext 為 false', () => {
    const result = apiPaginated(fakeEvent(), [], { page: 4, pageSize: 3, total: 10 })
    expect(result.meta.pagination?.hasNext).toBe(false)
  })

  it('沒有資料時 totalPages 為 0', () => {
    const result = apiPaginated(fakeEvent(), [], { page: 1, pageSize: 20, total: 0 })
    expect(result.meta.pagination?.totalPages).toBe(0)
    expect(result.meta.pagination?.hasNext).toBe(false)
  })
})

describe('apiFailure', () => {
  it('可揭露的錯誤保留訊息與細節', () => {
    const error = new AppError(ERROR_CODE.VALIDATION_ERROR, '欄位有誤', {
      details: { fieldErrors: { email: ['格式不正確'] } },
    })
    const result = apiFailure(fakeEvent(), error)

    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.message).toBe('欄位有誤')
    expect(result.error.details).toEqual({ fieldErrors: { email: ['格式不正確'] } })
  })

  // 安全性關鍵：內部錯誤的真實內容絕不能出現在回應中
  it('不可揭露的錯誤改用泛用訊息且移除 details', () => {
    const error = new AppError(
      ERROR_CODE.INTERNAL_ERROR,
      'ECONNREFUSED postgres://user:pw@10.0.0.5:5432',
      { details: { query: 'SELECT * FROM users' } },
    )
    const result = apiFailure(fakeEvent(), error)

    expect(result.error.message).toBe('系統發生錯誤，請稍後再試')
    expect(result.error.message).not.toContain('10.0.0.5')
    expect(result.error.details).toBeUndefined()
  })
})
