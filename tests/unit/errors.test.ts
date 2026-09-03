import { describe, expect, it } from 'vitest'
import { AppError, isAppError, toAppError } from '../../server/utils/errors'
import { ERROR_CODE } from '../../shared/constants/error-codes'

describe('AppError', () => {
  it('依錯誤碼自動推導 HTTP 狀態碼與預設訊息', () => {
    const error = new AppError(ERROR_CODE.NOT_FOUND)

    expect(error.statusCode).toBe(404)
    expect(error.message).toBe('找不到指定的資源')
    expect(error.code).toBe('NOT_FOUND')
  })

  it('可覆寫訊息並附帶結構化細節', () => {
    const error = new AppError(ERROR_CODE.VALIDATION_ERROR, '表單有誤', {
      details: { email: '格式不正確' },
    })

    expect(error.message).toBe('表單有誤')
    expect(error.details).toEqual({ email: '格式不正確' })
  })

  // 這是安全性的關鍵行為：5xx 的訊息不可外洩給使用者
  it('4xx 預設可揭露、5xx 預設不可揭露', () => {
    expect(new AppError(ERROR_CODE.BAD_REQUEST).expose).toBe(true)
    expect(new AppError(ERROR_CODE.INTERNAL_ERROR).expose).toBe(false)
    expect(new AppError(ERROR_CODE.UPSTREAM_ERROR).expose).toBe(false)
  })

  it('可明確覆寫 expose', () => {
    const error = new AppError(ERROR_CODE.INTERNAL_ERROR, '維護中', { expose: true })
    expect(error.expose).toBe(true)
  })

  it('保留原始錯誤作為 cause，供 log 追查', () => {
    const original = new Error('socket hang up')
    const error = new AppError(ERROR_CODE.UPSTREAM_ERROR, undefined, { cause: original })

    expect(error.cause).toBe(original)
  })
})

describe('toAppError', () => {
  it('已是 AppError 就原樣返回（不重複包裝）', () => {
    const original = new AppError(ERROR_CODE.CONFLICT)
    expect(toAppError(original)).toBe(original)
  })

  it('將 h3 風格的 statusCode 錯誤對應到正確的錯誤碼', () => {
    const converted = toAppError({ statusCode: 404, statusMessage: 'Page not found' })

    expect(converted.code).toBe('NOT_FOUND')
    expect(converted.statusCode).toBe(404)
    expect(converted.message).toBe('Page not found')
  })

  it('5xx 來源錯誤不保留原始訊息（避免內部細節外洩）', () => {
    const converted = toAppError({ statusCode: 500, statusMessage: 'ECONNREFUSED 10.0.0.5:5432' })

    expect(converted.statusCode).toBe(500)
    expect(converted.message).not.toContain('10.0.0.5')
  })

  it('找不到精確對應的狀態碼時退回泛用錯誤碼', () => {
    expect(toAppError({ statusCode: 418 }).code).toBe('BAD_REQUEST')
    expect(toAppError({ statusCode: 507 }).code).toBe('INTERNAL_ERROR')
  })

  // 迴歸測試：middleware 拋出的錯誤會被 h3 包成 H3Error，原始錯誤留在 cause。
  // 若不先解開，403 會被反查成 FORBIDDEN，CSRF_INVALID 這個更精確的碼就流失了。
  it('沿著 cause 鏈找回原始的 AppError，避免錯誤碼被狀態碼反查覆蓋', () => {
    const original = new AppError(ERROR_CODE.CSRF_INVALID)
    const wrapped = Object.assign(new Error('Forbidden'), {
      statusCode: 403,
      statusMessage: 'Forbidden',
      cause: original,
    })

    expect(toAppError(wrapped).code).toBe('CSRF_INVALID')
  })

  it('cause 巢狀多層仍能找回原始錯誤', () => {
    const original = new AppError(ERROR_CODE.RATE_LIMITED)
    const wrapped = new Error('outer', { cause: new Error('inner', { cause: original }) })

    expect(toAppError(wrapped).code).toBe('RATE_LIMITED')
  })

  it('cause 自我參照時不會無限迴圈', () => {
    const looped: { cause?: unknown; statusCode: number } = { statusCode: 500 }
    looped.cause = looped

    expect(toAppError(looped).code).toBe('INTERNAL_ERROR')
  })

  it('任意 thrown 值一律轉成 INTERNAL_ERROR', () => {
    expect(toAppError(new Error('boom')).code).toBe('INTERNAL_ERROR')
    expect(toAppError('字串也可能被 throw').code).toBe('INTERNAL_ERROR')
    expect(toAppError(undefined).code).toBe('INTERNAL_ERROR')
  })
})

describe('isAppError', () => {
  it('只認得 AppError', () => {
    expect(isAppError(new AppError(ERROR_CODE.NOT_FOUND))).toBe(true)
    expect(isAppError(new Error('nope'))).toBe(false)
    expect(isAppError({ code: 'NOT_FOUND' })).toBe(false)
  })
})
