import pino, { type Logger } from 'pino'

/**
 * 全站結構化日誌（Pino）。
 *
 * ## 為什麼是 Pino
 * Node 生態中效能最好、輸出格式最被主流 log 平台（Loki / Datadog / CloudWatch /
 * Elastic）直接支援的 JSON logger。
 *
 * ## 輸出格式
 * production 環境每行一筆 JSON，欄位如下：
 * ```json
 * {
 *   "level": "info",
 *   "time": "2026-08-26T10:30:00.000Z",
 *   "service": "frontend-template",
 *   "env": "production",
 *   "requestId": "0f1c...",
 *   "method": "GET",
 *   "url": "/api/demo/list",
 *   "statusCode": 200,
 *   "durationMs": 42,
 *   "msg": "request completed"
 * }
 * ```
 *
 * ## 重要：production 不掛 transport
 * Pino 官方建議正式環境直接寫 stdout，由容器的 log collector（Docker / K8s /
 * Fluent Bit）負責搬運與美化。理由有二：
 * 1. transport 會開 worker thread，序列化成本反而拖慢主執行緒。
 * 2. Nitro 打包（rollup）後的 bundle 中，worker thread 找不到 transport 進入點，
 *    會在正式環境噴 `unable to determine transport target` 而整個掛掉。
 *
 * 所以 `pino-pretty` 只在 `NODE_ENV !== 'production'` 時啟用。
 *
 * ## 使用方式
 * 在 request 生命週期內，**一律使用 `event.context.logger`**（由
 * `server/middleware/00.request-context.ts` 注入的 child logger），它會自動帶上
 * `requestId`，讓同一次請求的所有 log 串得起來：
 *
 * ```ts
 * export default defineApiHandler(async (event) => {
 *   event.context.logger.info({ userId }, 'fetching user orders')
 * })
 * ```
 *
 * 只有在 request 生命週期之外（plugin 啟動、排程任務）才直接用 `logger`。
 */

const isProduction = process.env.NODE_ENV === 'production'

/** 敏感欄位遮罩。任何符合這些路徑的值都會被換成 `[Redacted]`，不會進 log。 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.creditCard',
]

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

  // level 以字串輸出（"info"）而非 Pino 預設的數字（30）。
  // 主流 log 平台的預設 parser 都認字串，少一道 mapping 設定。
  formatters: {
    level: (label) => ({ level: label }),
  },

  // ISO 8601 時間戳，跨時區可讀且可排序。
  timestamp: pino.stdTimeFunctions.isoTime,

  // 每筆 log 都帶上服務識別，多服務共用同一個 log 索引時才分得出來源。
  base: {
    service: process.env.SERVICE_NAME ?? 'frontend-template',
    env: process.env.NODE_ENV ?? 'development',
  },

  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]',
  },

  // 開發時輸出彩色可讀格式；正式環境維持純 JSON（見上方說明）。
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
          messageFormat: '{if requestId}[{requestId}] {end}{msg}',
        },
      },
})

/**
 * 建立帶有固定欄位的 child logger。
 *
 * @example
 * ```ts
 * const jobLogger = createChildLogger({ job: 'sync-products' })
 * jobLogger.info('started')  // 之後每筆都會自動帶 job 欄位
 * ```
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}

export type { Logger }
