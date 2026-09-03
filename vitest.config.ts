import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

/**
 * Vitest 設定 —— 分成三個 project，各自跑在最適合的環境中。
 *
 * | project | 環境 | 測什麼 | 速度 |
 * |---------|------|--------|------|
 * | `unit`  | node | 純函式邏輯（錯誤轉換、回應格式、斷路器） | 毫秒級 |
 * | `nuxt`  | nuxt（happy-dom） | composable 與元件的實際行為 | 秒級 |
 * | `e2e`   | node | 真的把 Nuxt 建置起來跑，驗證前端 → BFF → 上游整條鏈 | 分鐘級 |
 *
 * 分開的好處是：改一行邏輯時可以只跑 `pnpm test:unit`（1 秒內回饋），
 * 只有在 push 前或 CI 才跑完整的 `pnpm test`。
 *
 * 指令：
 * ```
 * pnpm test          # 全部
 * pnpm test:unit     # 只跑單元測試（最快）
 * pnpm test:nuxt     # 只跑元件／composable 測試
 * pnpm test:e2e      # 只跑端對端測試
 * pnpm test:watch    # 監看模式
 * ```
 *
 * 註：只有需要 Nuxt 執行環境的 project 才用 `defineVitestProject` 包裝
 * （它會注入 `nuxt` 測試環境）。其餘 project 用一般設定即可，啟動更快。
 */
export default defineConfig({
  test: {
    projects: [
      {
        // 純邏輯測試：不需要瀏覽器、不需要 Nuxt，跑最快
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      // defineVitestProject 是非同步的：它需要先解析 Nuxt 專案設定，
      // 才能組出帶有 auto-imports、別名與元件解析的測試環境
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              // happy-dom 比 jsdom 快很多，且對這個樣板用到的 API 支援完整
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          // e2e 會實際建置 Nuxt 並啟動伺服器，需要放寬時間限制
          testTimeout: 60_000,
          hookTimeout: 300_000,
          // 端對端測試共用同一個伺服器與上游 stub，不能平行跑
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['app/**/*.ts', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', 'server/utils/demo-data.ts'],
    },
  },
})
