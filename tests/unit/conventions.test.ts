import { describe, expect, it } from 'vitest'
import {
  SECRET_NAME_PATTERN,
  envExampleVars,
  findSkipReason,
  runtimeConfigKeys,
  stripNoise,
  toConfigKey,
  toEnvName,
} from '../../scripts/lib/conventions.mjs'

/**
 * `scripts/check-conventions.mjs` 的解析邏輯。
 *
 * 這幾個函式是那支腳本最容易壞的部分：大括號配對一旦被註解或字串騙過去，
 * 整個檢查就會沉默地什麼都抓不到 —— 比報錯更糟，因為沒人會發現。
 * 這個樣板的 `nuxt.config.ts` 註解量很大，所以「註解裡的大括號」不是假想的情境。
 */

describe('stripNoise', () => {
  it('抹掉註解與字串內容，但保留字元位置', () => {
    const src = `const a = 1 // { 註解裡的大括號\nconst b = '{ 字串裡的 }'`
    const out = stripNoise(src)

    expect(out).toHaveLength(src.length)
    expect(out.split('\n')).toHaveLength(2)
    // 大括號被抹掉了，不會干擾後面的配對
    expect(out).not.toContain('{')
    expect(out).not.toContain('}')
    // 結構字元留著
    expect(out).toContain('const a = 1')
  })

  it('處理區塊註解與沒有結尾的字串', () => {
    expect(stripNoise('/* { */ x')).not.toContain('{')
    expect(() => stripNoise("const a = 'no closing quote")).not.toThrow()
  })

  it('不把 regex 字面值結尾的斜線當成行註解', () => {
    // /^https?:\/\// 的最後兩個字元是 //，naive 的實作會把該行剩下的部分全抹掉，
    // 連同結構用的大括號一起 —— 配對就錯了，而且是靜默的
    const src = 'const a = { p: /^https?:\\/\\// }'

    expect(stripNoise(src)).toContain('}')
  })

  it('除法不會被誤認成 regex 開頭', () => {
    // 前一個非空白字元是運算元結尾時，/ 是除法而不是 regex
    const src = 'const a = { x: b / c, y: 1 }'

    expect(stripNoise(src)).toContain('y: 1')
    expect(stripNoise(src)).toContain('}')
  })
})

describe('runtimeConfigKeys', () => {
  const src = `
export default defineNuxtConfig({
  /**
   * 註解裡出現 { 與 } 不該影響配對。
   * public.appName ← NUXT_PUBLIC_APP_NAME
   */
  runtimeConfig: {
    // --- Session ---
    sessionPassword: '',
    sessionMaxAge: 60 * 60 * 8,
    maxBodyBytes: 1_048_576,

    public: {
      appName: 'Frontend Template',
      apiBase: '/api',
      nested: {
        shouldNotBeCollected: true,
      },
    },
  },
  vite: { plugins: [] },
})
`

  it('分出頂層與 public 的鍵', () => {
    const { top, pub } = runtimeConfigKeys(src)

    expect([...top].sort()).toEqual(['maxBodyBytes', 'sessionMaxAge', 'sessionPassword'])
    expect([...pub].sort()).toEqual(['apiBase', 'appName', 'nested'])
  })

  it('不收巢狀物件內部的鍵', () => {
    const { top, pub } = runtimeConfigKeys(src)

    expect(top.has('shouldNotBeCollected')).toBe(false)
    expect(pub.has('shouldNotBeCollected')).toBe(false)
  })

  it('不把 public 自己算成一般的頂層設定', () => {
    expect(runtimeConfigKeys(src).top.has('public')).toBe(false)
  })

  it('runtimeConfig 之後的設定不會被算進來', () => {
    expect(runtimeConfigKeys(src).top.has('vite')).toBe(false)
  })

  it('runtimeConfig 裡有 regex 字面值時仍然配對正確', () => {
    const withRegex = `
export default defineNuxtConfig({
  runtimeConfig: {
    public: { urlPattern: /^https?:\\/\\// },
    appName: 'x',
    siteUrl: '',
  },
  vite: { plugins: [] },
  modules: ['@pinia/nuxt'],
})
`
    const { top, pub } = runtimeConfigKeys(withRegex)

    // 配對錯位的話，runtimeConfig 以外的鍵會被當成設定鍵（假硬錯），
    // 而頂層的鍵會被誤判成 public（反方向則讓真的機密靜默放過）
    expect([...top].sort()).toEqual(['appName', 'siteUrl'])
    expect([...pub]).toEqual(['urlPattern'])
  })

  it('public 不是物件時，不把別的巢狀物件誤算成 public 的子鍵', () => {
    const odd = `
export default defineNuxtConfig({
  runtimeConfig: {
    public: PUBLIC_DEFAULTS,
    nitro: { preset: 'node-server' },
  },
})
`
    expect([...runtimeConfigKeys(odd).pub]).toEqual([])
  })

  it('沒有 runtimeConfig 時回傳空集合而不是炸掉', () => {
    const { top, pub } = runtimeConfigKeys('export default defineNuxtConfig({})')

    expect(top.size).toBe(0)
    expect(pub.size).toBe(0)
  })

  it('認得這個專案真正的 nuxt.config.ts', async () => {
    const { readFile } = await import('node:fs/promises')
    const real = await readFile(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    const { top, pub } = runtimeConfigKeys(real)

    expect(top).toContain('sessionPassword')
    expect(top).toContain('apiBaseUrl')
    expect(pub).toContain('appName')
    expect(pub).toContain('loginPath')
    // 機密只能在頂層
    expect(pub).not.toContain('apiKey')
  })
})

describe('envExampleVars', () => {
  const src = `# 標記 [必填] 的項目在 production 缺少時會拒絕啟動

# ── Session ──

# [必填] 加密 session cookie 的密鑰
# 產生方式：openssl rand -base64 48
NUXT_SESSION_PASSWORD=change-me

# session 有效秒數
NUXT_SESSION_MAX_AGE=28800

NUXT_PUBLIC_APP_NAME=Frontend Template
`

  it('讀出變數名與必填標記', () => {
    const vars = envExampleVars(src)

    expect([...vars.keys()]).toEqual([
      'NUXT_SESSION_PASSWORD',
      'NUXT_SESSION_MAX_AGE',
      'NUXT_PUBLIC_APP_NAME',
    ])
    expect(vars.get('NUXT_SESSION_PASSWORD')?.required).toBe(true)
    expect(vars.get('NUXT_SESSION_MAX_AGE')?.required).toBe(false)
  })

  it('空行會中斷註解區塊 —— 檔頭的說明不會污染第一個變數', () => {
    // 檔案開頭那句「標記 [必填] 的項目…」隔了空行，不該讓後面的變數都變成必填
    expect(envExampleVars(src).get('NUXT_PUBLIC_APP_NAME')?.required).toBe(false)
  })

  it('認得這個專案真正的 .env.example', async () => {
    const { readFile } = await import('node:fs/promises')
    const real = await readFile(new URL('../../.env.example', import.meta.url), 'utf8')
    const vars = envExampleVars(real)

    expect(vars.get('NUXT_SESSION_PASSWORD')?.required).toBe(true)
    expect(vars.get('NUXT_API_BASE_URL')?.required).toBe(true)
    expect(vars.get('NUXT_API_KEY')?.required).toBe(false)
  })
})

describe('toEnvName / toConfigKey', () => {
  // 這些對應關係寫在 nuxt.config.ts 的註解裡，是 Nuxt 的 runtimeConfig 覆寫規則
  const pairs = [
    ['sessionPassword', 'SESSION_PASSWORD'],
    ['apiBaseUrl', 'API_BASE_URL'],
    ['maxBodyBytes', 'MAX_BODY_BYTES'],
    ['circuitBreakerResetMs', 'CIRCUIT_BREAKER_RESET_MS'],
    ['appName', 'APP_NAME'],
  ] as const

  it.each(pairs)('%s ↔ %s', (configKey, envName) => {
    expect(toEnvName(configKey)).toBe(envName)
    expect(toConfigKey(envName)).toBe(configKey)
  })
})

describe('findSkipReason', () => {
  it('取出理由', () => {
    expect(findSkipReason('fix: 調整設定\n\n[skip-policy: 這個鍵是建置期推導的]')).toBe(
      '這個鍵是建置期推導的',
    )
  })

  it('沒寫就是 null', () => {
    expect(findSkipReason('fix: 一般的 commit 訊息')).toBeNull()
    // 只寫標記但沒給理由不算 —— 逃生門必須留下理由
    expect(findSkipReason('[skip-policy:]')).toBeNull()
  })
})

describe('SECRET_NAME_PATTERN', () => {
  it.each(['analyticsToken', 'apiKey', 'api_key', 'sessionPassword', 'clientSecret', 'privateKey'])(
    '%s 看起來是機密',
    (name) => {
      expect(SECRET_NAME_PATTERN.test(name)).toBe(true)
    },
  )

  it.each(['appName', 'apiBase', 'loginPath', 'siteUrl', 'demoEnabled'])('%s 不是機密', (name) => {
    expect(SECRET_NAME_PATTERN.test(name)).toBe(false)
  })
})
