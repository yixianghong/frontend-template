import { ofetch, type FetchOptions } from 'ofetch'
import type { H3Event } from 'h3'
import { AppError, ERROR_CODE } from './errors'
import { getUpstreamToken } from './session'
import { getCircuitBreaker } from './circuit-breaker'
import { REQUEST_ID_HEADER } from '../../shared/constants/http'
import { logger as rootLogger } from './logger'

/**
 * 外部 API 客戶端 —— BFF 對外的唯一出口。
 *
 * ## 這是整個架構的鐵則
 * 前端**永遠不直接呼叫外部 API**。所有外部呼叫都經過這裡，好處是：
 *
 * | 面向 | 好處 |
 * |------|------|
 * | 安全 | API key / access token 只存在 Node 層，前端與瀏覽器完全接觸不到 |
 * | 韌性 | timeout、retry、斷路器集中在一處，不用每個功能各寫一次 |
 * | 可觀測 | 每一次外部呼叫都有結構化 log，帶著同一個 requestId 可串起全鏈路 |
 * | 可控 | 上游改網址、加簽章、換認證方式，只改這一個檔案 |
 *
 * ## 內建的韌性機制
 * 1. **Timeout**：預設 10 秒，避免請求無限期卡住。
 * 2. **指數退避重試**：只重試「冪等方法（GET/HEAD/PUT/DELETE）」且是
 *    「可重試的狀態碼（408/429/5xx）或網路錯誤」。
 *    POST 預設不重試 —— 重送可能造成重複建立訂單這類副作用。
 * 3. **斷路器**：上游連續失敗後快速失敗，避免連鎖故障。詳見 `circuit-breaker.ts`。
 * 4. **追蹤 ID 傳遞**：把本次請求的 `x-request-id` 一路帶給上游，
 *    上游若也有記錄這個 header，跨服務的問題就能直接對得起來。
 *
 * ## 如何新增第二個上游服務
 * ```ts
 * // server/utils/upstream.ts 底部
 * export const paymentApi = createUpstreamClient({
 *   name: 'payment',
 *   baseUrl: () => useRuntimeConfig().paymentApiBaseUrl,
 * })
 *
 * // 使用
 * const result = await paymentApi(event, '/charges', { method: 'POST', body })
 * ```
 */

/** 可重試的 HTTP 狀態碼。這些狀態代表「暫時性失敗」，再試一次可能就成功。 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/** 冪等方法：重複執行結果相同，所以重試是安全的。 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'])

export interface UpstreamOptions extends Omit<
  FetchOptions<'json'>,
  'baseURL' | 'retry' | 'timeout'
> {
  /** 逾時毫秒數，預設取自 runtimeConfig（10000）。 */
  timeoutMs?: number
  /** 最大重試次數（不含第一次），預設 2。設 0 表示不重試。 */
  retries?: number
  /**
   * 是否自動帶上使用者的 access token（從加密 session 取出）。
   * 預設 `true`。呼叫不需登入的公開端點時設為 `false`。
   */
  auth?: boolean
}

interface UpstreamClientConfig {
  /** 服務代號，用於 log 與斷路器分組。 */
  name: string
  /** 取得 base URL 的函式（延遲求值，才能讀到執行期的 runtimeConfig）。 */
  baseUrl: () => string
  /** 每次請求都要附加的靜態 header，例如 API key。 */
  staticHeaders?: () => Record<string, string>
}

/**
 * 建立一個綁定特定上游服務的呼叫函式。
 *
 * @returns `(event, path, options) => Promise<T>`
 */
export function createUpstreamClient(config: UpstreamClientConfig) {
  return async function call<T = unknown>(
    event: H3Event,
    path: string,
    options: UpstreamOptions = {},
  ): Promise<T> {
    const runtimeConfig = useRuntimeConfig(event)
    const log = event.context.logger ?? rootLogger
    const method = (options.method ?? 'GET').toString().toUpperCase()

    const timeoutMs = options.timeoutMs ?? runtimeConfig.upstreamTimeoutMs
    const maxRetries = options.retries ?? (IDEMPOTENT_METHODS.has(method) ? 2 : 0)

    const breaker = getCircuitBreaker(config.name, {
      failureThreshold: runtimeConfig.circuitBreakerThreshold,
      resetTimeoutMs: runtimeConfig.circuitBreakerResetMs,
    })

    // 電路已跳閘：立即失敗，完全不打上游。
    if (!breaker.canAttempt()) {
      log.warn({ upstream: config.name, path, method }, 'circuit breaker is open, failing fast')
      throw new AppError(ERROR_CODE.SERVICE_UNAVAILABLE, '外部服務暫時無法使用，請稍後再試')
    }

    const headers: Record<string, string> = {
      ...config.staticHeaders?.(),
      // 把追蹤 ID 傳給上游，跨服務 log 才串得起來
      [REQUEST_ID_HEADER]: event.context.requestId ?? 'unknown',
      ...(options.headers as Record<string, string> | undefined),
    }

    if (options.auth !== false) {
      const token = await getUpstreamToken(event)
      if (token) headers.Authorization = `Bearer ${token}`
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startedAt = performance.now()
      try {
        const result = await ofetch<T>(path, {
          ...options,
          baseURL: config.baseUrl(),
          headers,
          timeout: timeoutMs,
          // 用自己的重試迴圈以支援指數退避，關掉 ofetch 內建的固定間隔重試
          retry: false,
        })

        breaker.recordSuccess()
        log.info(
          {
            upstream: config.name,
            method,
            path,
            durationMs: Math.round(performance.now() - startedAt),
            attempt: attempt + 1,
          },
          'upstream request succeeded',
        )
        return result
      } catch (err) {
        lastError = err
        const status = extractStatus(err)
        const durationMs = Math.round(performance.now() - startedAt)
        const canRetry =
          attempt < maxRetries &&
          IDEMPOTENT_METHODS.has(method) &&
          (status === undefined || RETRYABLE_STATUS.has(status))

        log.warn(
          {
            upstream: config.name,
            method,
            path,
            status,
            durationMs,
            attempt: attempt + 1,
            canRetry,
          },
          'upstream request failed',
        )

        if (!canRetry) break

        // 指數退避 + 抖動（jitter）：避免所有失敗的請求在同一瞬間一起重試，
        // 反而把剛要恢復的上游再打掛（thundering herd）。
        await sleep(backoffDelay(attempt))
      }
    }

    // 只有「伺服器端／網路層」的失敗才算進斷路器。
    // 4xx 是我們自己請求寫錯，重試或跳閘都無濟於事，不該影響電路狀態。
    const finalStatus = extractStatus(lastError)
    if (finalStatus === undefined || finalStatus >= 500) {
      breaker.recordFailure()
    }

    throw mapUpstreamError(lastError, config.name)
  }
}

/** 從各種 fetch 錯誤形狀中取出 HTTP 狀態碼。網路層錯誤沒有狀態碼，回傳 undefined。 */
function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    if ('status' in err && typeof err.status === 'number') return err.status
    if ('statusCode' in err && typeof err.statusCode === 'number') return err.statusCode
    if ('response' in err) {
      const res = (err as { response?: { status?: number } }).response
      if (res && typeof res.status === 'number') return res.status
    }
  }
  return undefined
}

/**
 * 把上游的錯誤轉成我們的 `AppError`。
 *
 * 重點：**不要把上游的錯誤訊息原封不動丟給前端**。上游的錯誤可能包含
 * 內部服務名稱、SQL 片段、堆疊資訊。這裡只保留狀態碼語意，訊息用我們自己的。
 */
function mapUpstreamError(err: unknown, upstreamName: string): AppError {
  const isTimeout =
    err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')

  if (isTimeout) {
    return new AppError(ERROR_CODE.UPSTREAM_TIMEOUT, undefined, { cause: err })
  }

  const status = extractStatus(err)

  switch (status) {
    case 400:
      return new AppError(ERROR_CODE.BAD_REQUEST, undefined, { cause: err })
    case 401:
      // 上游說我們的 token 無效 → 使用者需要重新登入
      return new AppError(ERROR_CODE.UNAUTHORIZED, '登入已過期，請重新登入', { cause: err })
    case 403:
      return new AppError(ERROR_CODE.FORBIDDEN, undefined, { cause: err })
    case 404:
      return new AppError(ERROR_CODE.NOT_FOUND, undefined, { cause: err })
    case 409:
      return new AppError(ERROR_CODE.CONFLICT, undefined, { cause: err })
    case 429:
      return new AppError(ERROR_CODE.RATE_LIMITED, '外部服務限流中，請稍後再試', { cause: err })
    default:
      return new AppError(ERROR_CODE.UPSTREAM_ERROR, undefined, {
        cause: err,
        details: { upstream: upstreamName, status },
      })
  }
}

/** 指數退避 + 隨機抖動：200ms、400ms、800ms…（各自再乘上 0.5～1.5 的隨機係數）。 */
export function backoffDelay(attempt: number, baseMs = 200): number {
  const exponential = baseMs * 2 ** attempt
  const jitter = 0.5 + Math.random()
  return Math.round(exponential * jitter)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 預設的上游 API 客戶端。
 *
 * @example 基本 GET
 * ```ts
 * const items = await upstreamFetch<DemoItem[]>(event, '/items')
 * ```
 *
 * @example 帶 query 與分頁
 * ```ts
 * const res = await upstreamFetch(event, '/items', { query: { page, pageSize } })
 * ```
 *
 * @example POST（預設不重試）
 * ```ts
 * await upstreamFetch(event, '/orders', { method: 'POST', body: payload })
 * ```
 *
 * @example 呼叫不需登入的公開端點
 * ```ts
 * await upstreamFetch(event, '/public/config', { auth: false })
 * ```
 */
export const upstreamFetch = createUpstreamClient({
  name: 'default',
  baseUrl: () => useRuntimeConfig().apiBaseUrl,
  staticHeaders: (): Record<string, string> => {
    const key = useRuntimeConfig().apiKey
    return key ? { 'x-api-key': key } : {}
  },
})
