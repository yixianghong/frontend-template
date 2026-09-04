<!-- blog-sync: commit=cfd3d65ba97c927259a8d22f1fad9fdbdc56982c updates=updates/ -->

# 我把「每個新專案都要重接一次的東西」做成了一個 Nuxt 4 樣板

每開一個新前端專案，前兩週都在做一樣的事：接 API 封裝、決定錯誤格式、
補上安全標頭、想辦法讓 access token 不要躺在 localStorage 裡、
把測試環境架起來、寫 Dockerfile。等這些做完，需求已經催第三次了。

更糟的是每次做出來的細節都不太一樣。上一個專案的錯誤信封長這樣，
這個專案長那樣；A 專案的 API 路徑散在各個頁面裡，B 專案收斂得還可以。
同一個團隊，三個專案三種寫法。

所以我把這些「每次都要重做、而且每次都做得不太一樣」的部分固定下來，
做成一個可以直接 `degit` 下來開新專案的樣板。

---

## 一句話說明架構

```
瀏覽器 ──────► Nuxt 前端 ──────► BFF (Nitro / Node) ──────► 外部 API
              app/                server/                  你的後端服務
              只認得 /api/*        唯一持有 secrets 的地方
```

前端**不直接呼叫外部 API**，只呼叫自家的 Node 層；由 Node 層去轉發。
這就是 BFF（Backend for Frontend）模式。多一層看起來像是多做工，
但它換來的東西相當實在，下面逐個講。

---

## 為什麼要多一層 Node

### 一、token 不會離開 Node 層

這是整個架構最核心的安全價值。

傳統 SPA 會把 access token 存在 localStorage，或存在前端讀得到的 cookie。
問題是只要發生任何一次 XSS，token 就被搬走了 —— 而且是完整可用的 token，
攻擊者可以拿去在自己的機器上打你的 API，不需要受害者的瀏覽器在場。

BFF 模式把這條路切斷：

```
瀏覽器 ──(httpOnly 加密 cookie)──► Node BFF ──(Authorization: Bearer …)──► 外部 API
         ↑ 前端 JS 讀不到                      ↑ token 只存在這一段
```

token 存在 h3 的 sealed session cookie 裡（加密 + 簽章），
瀏覽器拿到的只是一串密文，前端 JavaScript 因為 `httpOnly` 也完全讀不到。
就算真的中了 XSS，攻擊者最多只能在使用者的瀏覽器上發請求
（這部分交給 CSRF 與 SameSite 防護），偷不走可攜帶的憑證。

這件事重要到我替它寫了端對端測試 ——
`tests/e2e/bff.test.ts` 裡有一條叫「認證：token 絕不離開 Node 層」，
它會實際建置、啟動伺服器、跑完整登入流程，然後檢查回應裡沒有任何 token 痕跡。
這類「架構承諾」如果沒有測試釘住，衍生專案改壞了不會有人發現。

### 二、韌性機制只需要寫一次

對外的呼叫全部經過 `server/utils/upstream.ts` 這個唯一出口，
於是 timeout、重試、斷路器都集中在一處：

- **Timeout**：預設 10 秒，避免請求無限期卡住。
- **指數退避重試**：只重試冪等方法（GET/HEAD/PUT/DELETE），
  而且只在可重試的狀態碼（408/425/429/5xx）或網路錯誤時重試。
  **POST 預設不重試** —— 重送可能造成重複建立訂單這種副作用。
- **斷路器**：上游連續失敗到門檻後跳閘，之後的請求立即失敗而不再實際發出。

斷路器值得多說兩句。上游掛掉時如果不處理，每個進來的請求都會傻等到 timeout 才失敗；
流量一大，這些卡住的請求會耗盡 Node 的連線與記憶體，
變成「上游掛掉 → 我們也跟著掛掉」的連鎖故障。斷路器用三個狀態擋下這件事：

```
           連續失敗 >= threshold
  closed ─────────────────────────► open
    ▲                                 │ 經過 resetTimeoutMs
    │                                 ▼
    └──── 試探成功 ────────────── half-open
                                      │ 試探失敗
                                      └──► open（重新計時）
```

實作上有個小決定：時間來源做成可注入的 `now` 參數。
這樣單元測試可以直接快轉時間，不必真的 `sleep`，測試又快又穩。

### 三、上游改東西，只改一個檔案

上游換網址、加簽章、換認證方式 —— 全部只動 `upstream.ts`。
要接第二個上游服務也只是多一個 client：

```ts
export const paymentApi = createUpstreamClient({
  name: 'payment',
  baseUrl: () => useRuntimeConfig().paymentApiBaseUrl,
})
```

---

## 統一回傳格式

BFF 的每個 JSON 回應都必定是這兩種形狀之一 —— 包含 404、500，
以及 middleware 拋出的錯誤。沒有例外。

```jsonc
// 成功
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "0f1c…",
    "timestamp": "2026-08-26T10:30:00.000Z",
    "pagination": { "page": 1, "pageSize": 20, "total": 47, "totalPages": 3, "hasNext": true }
  }
}

// 失敗
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "請求參數有誤",
    "details": { "fieldErrors": { "email": ["格式不正確"] } },
    "requestId": "0f1c…",
    "timestamp": "2026-08-26T10:30:00.000Z"
  }
}
```

「沒有例外」這件事比格式長什麼樣更重要。
最容易出事的從來不是正常路徑，而是那些沒被接住的錯誤 ——
前端寫好的錯誤處理遇到一個裸的 HTML 500 頁面就整個失效。
所以 `server/error.ts` 做兜底，確保 `/api/*` 底下永遠回 JSON 信封。

前端拿到的 `data` 已經拆封過，錯誤則統一轉成 `ApiError`
（帶 `code` / `message` / `fieldErrors` / `requestId`）。

寫一支新端點長這樣：

```ts
// server/api/orders/index.get.ts
export default defineApiHandler(async (event) => {
  await requireUser(event) // 401 若未登入
  const { page, pageSize } = await validateQuery(event, paginationQuerySchema)

  const raw = await upstreamFetch(event, '/orders', { query: { page, limit: pageSize } })
  const data = validateUpstream(event, orderListSchema, raw, 'GET /orders')

  return apiPaginated(event, data.items, { page, pageSize, total: data.total })
})
```

錯誤直接 `throw new AppError(ERROR_CODE.NOT_FOUND, '找不到這筆訂單')`，
`defineApiHandler` 會轉成正確的狀態碼與統一格式。

---

## 前端的 API 分層

```
頁面 / 元件
  └─ 領域 composable   app/composables/api/*     ← 端點路徑與型別都在這層
       └─ 通用封裝      useApiFetch / useApi
            └─ 底層     useApiClient（SSR cookie 轉發、CSRF、錯誤正規化）
                 └─ BFF /api/*
```

**規則是：頁面裡不該出現任何 API 路徑字串。**

```ts
// ❌ 端點散落在各個頁面，後端改路徑時要翻遍整個專案
const { data } = useApiFetch<DemoItem[]>('/demo/list', { query: { page } })

// ✅ 收斂到領域 composable，改路徑只要改一個檔案
const { data } = useDemoItems({ page })
```

附帶的好處：型別只寫一次、預設參數（例如 `pageSize`）集中管理不會各頁不一致、
可以只測這一層而不必掛載整個頁面。

通用封裝有兩支，判斷原則一句話：

> 資料是「畫面的一部分」→ `useApiFetch`；是「動作的結果」→ `useApi`。

| 前綴                     | 底層                    | 什麼時候用                     |
| ------------------------ | ----------------------- | ------------------------------ |
| `useXxxs()` / `useXxx()` | `useApiFetch`（宣告式） | 進頁面就要有的資料，會參與 SSR |
| `useXxxActions()`        | `useApi`（命令式）      | 使用者按了才發生的操作         |

分成兩種不是為了分類癖，是因為底層機制本來就不同：
宣告式的必須在 `setup` 中呼叫，命令式的可以在事件處理函式裡隨時呼叫。
混成一支會讓使用者搞不清楚哪些能在哪裡用。

---

## 資安

| 機制      | 位置                                       | 說明                                                            |
| --------- | ------------------------------------------ | --------------------------------------------------------------- |
| 安全標頭  | `server/middleware/10.security-headers.ts` | CSP、HSTS、X-Frame-Options、Referrer-Policy、Permissions-Policy |
| CORS      | `server/middleware/20.cors.ts`             | 白名單比對，預設不開放跨域                                      |
| 流量限制  | `server/middleware/30.rate-limit.ts`       | 固定時間窗，多實例請換 Redis                                    |
| Body 防護 | `server/middleware/40.body-guard.ts`       | 大小上限 + Content-Type 白名單                                  |
| CSRF      | `server/middleware/50.csrf.ts`             | double-submit cookie，定值時間比對                              |
| 輸入驗證  | `server/utils/validate.ts`                 | zod，失敗回 400 + 欄位錯誤                                      |
| Session   | `server/utils/session.ts`                  | httpOnly 加密 cookie，**token 不離開 Node 層**                  |
| 日誌遮罩  | `server/utils/logger.ts`                   | authorization / cookie / password / token 自動遮罩              |

Nitro 的 middleware 依**檔名字母序**執行，所以用數字前綴控制順序：

```
請求進來
  │
  ├─ 00.request-context.ts   產生 requestId、建立 child logger
  ├─ 10.security-headers.ts  CSP、HSTS、X-Frame-Options…
  ├─ 20.cors.ts              CORS 白名單
  ├─ 30.rate-limit.ts        流量限制
  ├─ 40.body-guard.ts        body 大小與 Content-Type 檢查
  ├─ 50.csrf.ts              CSRF double-submit 驗證
  │
  ├─ api/**                  defineApiHandler 包裝
  │    └─ utils/upstream.ts  呼叫外部 API（timeout / retry / 斷路器）
  │
  ├─ error.ts                兜底：/api/* 永遠回 JSON 錯誤信封
  └─ plugins/10.access-log.ts 回應送出後輸出 access log
```

一個已知的取捨：目前 `script-src` 含 `'unsafe-inline'`，
因為 Nuxt 的 SSR payload 是 inline script。要拿掉它需要 nonce 機制，
與其在樣板裡自己刻，不如直接換成
[`nuxt-security`](https://nuxt-security.vercel.app/) 模組
並移除 `server/middleware/10.security-headers.ts`。

---

## 日誌：requestId 串起全鏈路

Pino，production 輸出單行 JSON，dev 用 `pino-pretty` 美化。

```json
{
  "level": "info",
  "time": "2026-08-26T10:30:00.000Z",
  "service": "frontend-template",
  "requestId": "0f1c…",
  "method": "GET",
  "url": "/api/demo/list",
  "statusCode": 200,
  "durationMs": 42,
  "msg": "request completed"
}
```

請求生命週期內一律用 `event.context.logger`，它已經綁好 `requestId`，
同一次請求的所有 log（含對外部 API 的呼叫）都串得起來。
`requestId` 同時出現在回應標頭 `x-request-id` 與 body 的 `meta.requestId` 中 ——
使用者回報問題時提供這串 ID，就能把整條軌跡撈出來。

> production 刻意不掛 pino transport，直接寫 stdout 交給容器的 log collector。
> 這是 pino 官方建議，也避開 Nitro 打包後 worker thread transport 會失效的問題。

---

## 測試分三層

| 層級          | 環境             | 測什麼                                                  |
| ------------- | ---------------- | ------------------------------------------------------- |
| `tests/unit/` | node             | 錯誤轉換、回應格式、斷路器、schema                      |
| `tests/nuxt/` | nuxt + happy-dom | composable 行為、元件渲染與無障礙屬性                   |
| `tests/e2e/`  | node             | 真的建置並啟動 Nuxt，驗證前端 → BFF → 外部 API 完整鏈路 |

e2e 用 `tests/mocks/upstream-server.ts` 起一個**真實的 HTTP stub** 當外部 API。
不用 MSW 是有原因的：Nuxt 伺服器跑在另一個 process，
測試 process 裡的 fetch 攔截根本影響不到它。元件層測試則用 Nuxt 官方的 `registerEndpoint`。

單元測試約 150ms，全部跑完約 5 秒（不含 e2e 的建置時間）。

---

## 示範內容會自己消失

樣板內建了一組 `/demo` 示範，讓人 clone 下來就能看到完整的資料流。
但示範內容留在正式環境是個負擔，所以：

- **前端**：production 建置時整個 `/demo` 路由樹被移除（`nuxt.config.ts` 的 `pages:extend`），
  程式碼不會進 bundle。
- **後端**：`server/api/demo/*` 由 `server/middleware/15.demo-guard.ts` 擋下。

為什麼後端要另外擋？因為 Nitro 的路由是掃描檔案系統決定的，
不像頁面那樣可以在建置期抽掉，所以需要補一道執行期守衛。
它回 404 而不是 403 —— 「這個端點在這個環境不存在」比「存在但你沒權限」更貼近事實，
也不會洩漏 production 有哪些隱藏端點。

CI 的 build job 會在每次 production 建置後實際 curl 這些路徑，確認全部回 404。

所以不必急著刪示範內容，正式環境本來就進不去。
真的要清乾淨時，README 有列出完整的刪除清單。

---

## 技術選型

| 項目 | 選擇                      | 版本        |
| ---- | ------------------------- | ----------- |
| 框架 | Nuxt（SSR）               | 4.5         |
| BFF  | Nitro / h3                | 2.13 / 1.15 |
| 樣式 | Tailwind CSS（CSS-first） | 4.3         |
| 驗證 | Zod                       | 4.4         |
| 日誌 | Pino                      | 10.3        |
| 狀態 | Pinia                     | 4.0         |
| 工具 | VueUse                    | 14.4        |
| i18n | @nuxtjs/i18n              | 10.6        |
| 測試 | Vitest + @nuxt/test-utils | 4.1         |

> ⚠️ Nuxt 4.5 底層仍是 **h3 v1**（h3 v2 還在 RC）。
> 寫 `server/` 程式碼時請照 h3 v1 的 API，不要套 v2 的寫法。

**刻意沒放進來的**：`@nuxt/image`、sitemap / robots、OpenTelemetry、Sentry、UI 元件庫。
樣板過胖比缺東西更難處理 —— 缺的可以加，多的要刪還得先搞懂它在幹嘛。
接入點都留好了（`server/utils/logger.ts` 可加 OTel、`nuxt.config.ts` 加模組即可）。

---

## 開始用

```bash
# 複製（不帶原有的 git 歷史）
pnpm dlx degit <你的帳號>/frontend-template my-project
cd my-project

pnpm install
cp .env.example .env
# 至少要改 NUXT_SESSION_PASSWORD（openssl rand -base64 48）

pnpm dev
```

開啟 http://localhost:3000 —— 不設定 `NUXT_API_BASE_URL` 也能跑，
demo 端點會使用內建假資料。

部署就是一個 Dockerfile 的事，K8s 的 readiness / liveness probe
與 graceful shutdown（`SHUTDOWN_DRAIN_MS`）也都接好了，滾動更新時不會掉請求。
要跑多實例的話，把 rate limit 與 cache 的 storage 換成 Redis，業務程式碼一行都不用動。

完整的設定、目錄職責與開發約定都寫在
[README](../../README.md) 與 [docs/CONTRIBUTING.md](../CONTRIBUTING.md)。
