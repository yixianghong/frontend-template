/**
 * 共用的 KV 儲存層（unstorage）。
 *
 * ## 為什麼要抽這一層
 * rate limit 計數、快取、session 索引這類狀態，在單機開發時放記憶體就夠了，
 * 但一旦水平擴展成多個 Pod，記憶體狀態就會失效（各 Pod 各數各的）。
 *
 * 這一層把「用什麼後端存」變成純設定問題：預設走 memory driver，
 * 要換 Redis 時**不需要改任何一行業務程式碼**，只要在 `nuxt.config.ts` 加：
 *
 * ```ts
 * nitro: {
 *   storage: {
 *     ratelimit: { driver: 'redis', url: process.env.REDIS_URL },
 *     cache:     { driver: 'redis', url: process.env.REDIS_URL },
 *   },
 * }
 * ```
 *
 * unstorage 支援的 driver 見 https://unstorage.unjs.io/drivers
 *
 * 註：`useStorage` 由 Nitro 自動匯入，不需要（也不應該）手動 import ——
 * `server/` 的型別檔會同時被前端的 TypeScript project 載入，
 * 從 `#imports` 匯入會在前端 project 中解析到 Nuxt app 的 `#imports` 而失敗。
 */

/** 流量限制計數器專用的 storage namespace。 */
export function useRateLimitStorage() {
  return useStorage('ratelimit')
}

/** 一般用途的快取 namespace。 */
export function useCacheStorage() {
  return useStorage('cache')
}

/**
 * 讀取快取，沒有就執行 `factory` 並寫入。
 *
 * 適合用在「上游資料變動不頻繁但呼叫成本高」的場景（設定檔、分類清單、匯率）。
 * 需要更完整的快取控制（SWR、依 header 變化的 key）時，改用 Nitro 內建的
 * `defineCachedEventHandler`，見 `server/api/demo/list.get.ts` 的註解。
 *
 * @param key 快取鍵。請自行加上前綴避免不同功能撞鍵，例如 `products:list:page-1`。
 * @param ttlSeconds 存活秒數。
 * @param factory 快取未命中時取得資料的函式。
 *
 * @example
 * ```ts
 * const categories = await cached('catalog:categories', 300, () =>
 *   upstreamFetch(event, '/categories'),
 * )
 * ```
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  const storage = useCacheStorage()
  const hit = await storage.getItem<{ value: T; expiresAt: number }>(key)

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }

  const value = await factory()
  await storage.setItem(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  return value
}
