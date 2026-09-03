import { z } from 'zod'
import { logger } from '../utils/logger'

/**
 * 啟動時驗證設定（fail-fast）。
 *
 * ## 為什麼要在啟動時檢查
 * 設定漏了一項，最糟的情況不是「啟動失敗」，而是「啟動成功、跑了三小時、
 * 直到某個使用者剛好走到那條路徑才 500」。那時錯誤訊息離真正的原因已經很遠，
 * 很難追。
 *
 * 在程序啟動時就把設定檢查完，缺什麼立刻明確地說出來並拒絕啟動 ——
 * 容器編排系統會直接標記部署失敗並回滾，問題在上線前就被攔下。
 *
 * ## 開發環境的權衡
 * 剛 clone 下來還沒建立 `.env` 就要求所有設定齊全會很惱人，所以：
 * - **development**：缺設定只發出明顯警告，並自動填入臨時值讓服務跑得起來
 * - **production**：缺任何一項必填設定就直接讓程序退出
 */

const isProduction = process.env.NODE_ENV === 'production'

/** 正式環境的必填設定 schema。 */
const productionConfigSchema = z.object({
  sessionPassword: z
    .string()
    .min(32, 'sessionPassword 至少需要 32 個字元（用於加密 session cookie）'),
  apiBaseUrl: z.url('apiBaseUrl 必須是有效的 URL，例如 https://api.example.com'),
  sessionMaxAge: z.number().int().positive(),
  upstreamTimeoutMs: z.number().int().positive(),
  rateLimitMax: z.number().int().positive(),
  rateLimitWindowMs: z.number().int().positive(),
  maxBodyBytes: z.number().int().positive(),
})

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  if (isProduction) {
    const result = productionConfigSchema.safeParse(config)

    if (!result.success) {
      const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      logger.fatal(
        { issues: result.error.issues },
        '設定驗證失敗，服務無法啟動。請檢查環境變數（見 .env.example）',
      )
      // 用 console 再輸出一次，確保即使 log 收集尚未就緒也看得到
      console.error('\n[FATAL] 設定驗證失敗：\n' + issues.join('\n') + '\n')
      process.exit(1)
    }

    logger.info('configuration validated')
    return
  }

  // --- 開發環境：只警告，不改動設定 ---
  //
  // ⚠️ 這裡刻意「只讀不寫」。Nuxt 在開發模式會把 runtimeConfig 凍結成唯讀物件，
  // 任何指派都會拋出 TypeError，而且發生在 Nitro plugin 初始化階段 ——
  // 整個伺服器會起不來，錯誤訊息還完全看不出跟 session 有關。
  //
  // 開發用的臨時密鑰改由 `server/utils/session.ts` 提供：那裡是唯一需要它的地方，
  // 也不必碰設定物件。
  if (!config.sessionPassword || config.sessionPassword.length < 32) {
    logger.warn(
      '未設定 NUXT_SESSION_PASSWORD，將使用本次啟動產生的臨時密鑰。' +
        '重啟後既有的登入狀態會失效。請複製 .env.example 為 .env 並設定它。',
    )
  }

  if (!config.apiBaseUrl) {
    logger.warn(
      '未設定 NUXT_API_BASE_URL，所有外部 API 呼叫都會失敗。' +
        '請在 .env 中設定，或參考 tests/mocks/upstream.ts 使用 MSW 攔截。',
    )
  }
})
