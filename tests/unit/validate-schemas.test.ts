import { describe, expect, it } from 'vitest'
import { paginationQuerySchema } from '../../shared/schemas/common'
import { loginSchema, publicUserSchema } from '../../shared/schemas/auth'

describe('paginationQuerySchema', () => {
  it('把 query string 的字串轉成數字', () => {
    // query string 進來永遠是字串，所以 schema 用了 z.coerce
    const result = paginationQuerySchema.parse({ page: '3', pageSize: '50' })
    expect(result).toEqual({ page: 3, pageSize: 50 })
  })

  it('未提供時套用預設值', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('擋下超出上限的 pageSize，避免拖垮上游', () => {
    const result = paginationQuerySchema.safeParse({ pageSize: '999999' })
    expect(result.success).toBe(false)
  })

  it('擋下非法的頁碼', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(paginationQuerySchema.safeParse({ page: 'abc' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('接受合法的帳密', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'password1234' })
    expect(result.success).toBe(true)
  })

  it('拒絕格式錯誤的 email 與過短的密碼', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: '123' })
    expect(result.success).toBe(false)

    const fields = result.error?.issues.map((i) => i.path[0])
    expect(fields).toContain('email')
    expect(fields).toContain('password')
  })
})

describe('publicUserSchema', () => {
  // 這是 BFF 安全模型的一環：回傳前端的資料一定經過這個 schema 過濾
  it('剝除 schema 未定義的欄位（例如上游夾帶的 token）', () => {
    const parsed = publicUserSchema.parse({
      id: '1',
      email: 'a@b.com',
      name: 'Dev',
      roles: ['user'],
      accessToken: 'super-secret-token',
      internalNote: '不該外流',
    })

    expect(parsed).not.toHaveProperty('accessToken')
    expect(parsed).not.toHaveProperty('internalNote')
    expect(parsed).toEqual({ id: '1', email: 'a@b.com', name: 'Dev', roles: ['user'] })
  })
})
