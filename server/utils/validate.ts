import { getQuery, getRouterParams, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { AppError, ERROR_CODE } from './errors'

/**
 * 以 zod schema 驗證請求輸入。
 *
 * ## 為什麼一定要驗證
 * BFF 是外部流量進入內網的唯一入口，任何未經驗證就轉發給上游 API 的參數
 * 都是攻擊面。這幾個 helper 讓「驗證」比「不驗證」更省事，開發者才會照做。
 *
 * ## 錯誤處理
 * 驗證失敗一律拋出 `AppError(VALIDATION_ERROR)`，HTTP 400，並把 zod 的
 * 欄位錯誤放進 `error.details.fieldErrors`，前端可直接拿來標紅對應輸入框：
 *
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "請求參數有誤",
 *     "details": {
 *       "fieldErrors": { "email": ["Invalid email address"] },
 *       "formErrors": []
 *     }
 *   }
 * }
 * ```
 */

/** 把 ZodError 轉成統一的 `AppError`。 */
function toValidationError(error: z.ZodError, source: string): AppError {
  const flat = z.flattenError(error)
  return new AppError(ERROR_CODE.VALIDATION_ERROR, `${source}參數有誤`, {
    details: flat,
    cause: error,
  })
}

/**
 * 驗證 request body（JSON）。
 *
 * @example
 * ```ts
 * const { email, password } = await validateBody(event, loginSchema)
 * ```
 */
export async function validateBody<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await readBody(event)
  } catch (err) {
    // JSON 解析失敗（body 不是合法 JSON）
    throw new AppError(ERROR_CODE.BAD_REQUEST, '請求內容不是有效的 JSON', { cause: err })
  }

  const result = schema.safeParse(raw)
  if (!result.success) throw toValidationError(result.error, '請求內容')
  return result.data
}

/**
 * 驗證 query string。
 *
 * 注意 query 進來永遠是字串，數字型欄位請在 schema 用 `z.coerce.number()`，
 * 參考 `shared/schemas/common.ts` 的 `paginationQuerySchema`。
 *
 * @example
 * ```ts
 * const { page, pageSize } = await validateQuery(event, paginationQuerySchema)
 * ```
 */
export async function validateQuery<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): Promise<z.output<S>> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) throw toValidationError(result.error, '查詢')
  return result.data
}

/**
 * 驗證路由參數（`[id].get.ts` 中的 `id`）。
 *
 * @example
 * ```ts
 * const { id } = await validateParams(event, idParamSchema)
 * ```
 */
export async function validateParams<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): Promise<z.output<S>> {
  const result = schema.safeParse(getRouterParams(event))
  if (!result.success) throw toValidationError(result.error, '路徑')
  return result.data
}

/**
 * 驗證**上游 API 的回應**。
 *
 * 這是常被忽略但很重要的一環：上游服務改了欄位、回了 null、或回了錯誤格式時，
 * 應該在 BFF 這一層就發現並記錄，而不是讓壞資料流到前端才在畫面上炸開。
 *
 * 驗證失敗會記 error log（含完整 zod issues 供追查），對外則回 `UPSTREAM_ERROR`，
 * 不洩漏上游的資料結構。
 *
 * @example
 * ```ts
 * const raw = await upstreamFetch(event, '/items')
 * const data = validateUpstream(event, demoListResponseSchema, raw, 'GET /items')
 * ```
 */
export function validateUpstream<S extends z.ZodType>(
  event: H3Event,
  schema: S,
  data: unknown,
  label: string,
): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    event.context.logger?.error(
      { upstream: label, issues: result.error.issues },
      'upstream response failed schema validation',
    )
    throw new AppError(ERROR_CODE.UPSTREAM_ERROR, undefined, { cause: result.error })
  }
  return result.data
}
