import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 迴歸測試：設定驗證不可以改動 runtimeConfig。
 *
 * ## 這個測試存在的原因
 * 早期版本在開發模式下缺少 `sessionPassword` 時，會直接把臨時密鑰**寫回**
 * runtimeConfig。但 Nuxt 開發模式的 runtimeConfig 是**凍結的唯讀物件**，
 * 指派會拋出 TypeError；又因為這發生在 Nitro plugin 初始化階段，
 * 整個伺服器起不來，而且錯誤訊息（"Cannot assign to read only property"）
 * 完全看不出跟 session 設定有關，非常難追。
 *
 * production 走的是另一條分支，所以端對端測試也抓不到 ——
 * 這正是需要一個專門測試守住它的原因。
 */

/** 載入 plugin 模組並取得它註冊的函式（繞過 Nitro 的 auto-import）。 */
async function loadEnvValidatePlugin(config: Record<string, unknown>) {
  const registered: Array<() => void> = []

  vi.stubGlobal('defineNitroPlugin', (fn: () => void) => {
    registered.push(fn)
    return fn
  })
  vi.stubGlobal('useRuntimeConfig', () => config)

  // 每次都重新載入，避免模組快取讓 stub 失效
  vi.resetModules()
  await import('../../server/plugins/00.env-validate')

  return registered[0]!
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('00.env-validate（開發環境）', () => {
  it('設定缺漏時不會改動被凍結的 runtimeConfig', async () => {
    // Object.freeze 模擬 Nuxt 開發模式的唯讀 runtimeConfig
    const frozenConfig = Object.freeze({
      sessionPassword: '',
      apiBaseUrl: '',
      sessionMaxAge: 3600,
    })

    const plugin = await loadEnvValidatePlugin(frozenConfig)

    // 關鍵斷言：不可拋出 TypeError
    expect(() => plugin()).not.toThrow()
    expect(frozenConfig.sessionPassword).toBe('')
  })

  it('設定齊全時同樣不改動設定', async () => {
    const frozenConfig = Object.freeze({
      sessionPassword: 'a'.repeat(40),
      apiBaseUrl: 'https://api.example.com',
      sessionMaxAge: 3600,
    })

    const plugin = await loadEnvValidatePlugin(frozenConfig)

    expect(() => plugin()).not.toThrow()
    expect(frozenConfig.sessionPassword).toBe('a'.repeat(40))
  })
})
