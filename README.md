# Nuxt 4 + BFF 企業級樣板

一個可以直接拿來開新專案的基底：前端只呼叫自家的 Node 層（BFF），
由 Node 層去呼叫外部 API。資安防護、結構化日誌、統一回傳格式、
整合測試、RWD 都已經接好。

```
瀏覽器 ──────► Nuxt 前端 ──────► BFF (Nitro / Node) ──────► 外部 API
              app/                server/                  你的後端服務
              只認得 /api/*        唯一持有 secrets 的地方
```

---

## 從這個樣板開新專案

```bash
# 1. 複製（不帶原有的 git 歷史）
pnpm dlx degit <你的帳號>/frontend-template my-project
cd my-project

# 2. 安裝
pnpm install

# 3. 設定環境變數
cp .env.example .env
# 至少要改 NUXT_SESSION_PASSWORD（產生方式：openssl rand -base64 48）

# 4. 啟動
pnpm dev
```

開啟 http://localhost:3000 —— 不設定 `NUXT_API_BASE_URL` 也能跑，
demo 端點會使用內建假資料。

### 開新專案時要改的地方

| 檔案                      | 改什麼                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `package.json`            | `name`                                                      |
| `.env`                    | `NUXT_SESSION_PASSWORD`、`NUXT_API_BASE_URL`                |
| `nuxt.config.ts`          | `runtimeConfig.public` 的 `appName`、`siteUrl`、`loginPath` |
| `app/pages/index.vue`     | 首頁佔位頁面，直接改成你的內容                              |
| `app/assets/css/main.css` | `@theme` 裡的品牌色與字體                                   |
| `i18n/locales/*.json`     | 文案                                                        |
| `public/favicon.svg`      | 圖示                                                        |

> `loginPath` 預設是 `/demo/login`（樣板的登入示範）。建立自己的登入頁之後
> 記得改掉 —— `middleware/auth.ts` 的導向與 `useAuth().logout()` 都讀這個值，
> 改一處就好。

### 示範內容只在開發環境存在

樣板的示範全部收在 `/demo` 底下，**production 建置時整個路由樹會被移除**
（`nuxt.config.ts` 的 `pages:extend`），程式碼不會進到 bundle；
對應的 `/api/demo/*` 端點由 `server/middleware/15.demo-guard.ts` 擋下。

```
/              app/pages/index.vue          你的首頁（永遠存在）
/demo          app/pages/demo/index.vue     示範總覽        ┐
/demo/login    app/pages/demo/login.vue     登入流程示範     │ 只在 dev
/demo/api      app/pages/demo/api/index.vue 兩種呼叫方式     │ 存在
/demo/api/:id  app/pages/demo/api/[id].vue  詳情頁          ┘
```

所以不必急著刪 —— 正式環境本來就進不去。CI 的 build job 會在每次
production 建置後實際 curl 這些路徑，確認全部回 404。

> `ENABLE_DEMO=true` 是給端對端測試用的例外開關（e2e 跑的是 production 建置，
> 需要 demo 路由存在才測得到完整鏈路）。正式部署不要設定它。

### 開新專案時要刪的地方

想徹底移除示範內容時：

- `app/pages/demo/`（整個目錄）
- `server/api/demo/`、`server/utils/demo-data.ts`
- `server/middleware/15.demo-guard.ts`
- `app/composables/api/useDemoApi.ts`
- `tests/nuxt/useDemoApi.test.ts`、`tests/unit/demo-guard.test.ts`
- `server/api/auth/login.post.ts` 中標記 `⚠️ DEMO 模式` 的區塊與 `demoLogin()`
- `i18n/locales/*.json` 中的 `demo` 區段
- `nuxt.config.ts` 的 `hooks.pages:extend` 與 `DEMO_ENABLED`
- 記得先建立自己的登入頁，並更新 `runtimeConfig.public.loginPath`

------------------------- | -------------------------------------------- |
| `package.json` | `name` |
| `.env` | `NUXT_SESSION_PASSWORD`、`NUXT_API_BASE_URL` |
| `nuxt.config.ts` | `runtimeConfig.public.appName`、`siteUrl` |
| `app/assets/css/main.css` | `@theme` 裡的品牌色與字體 |
| `i18n/locales/*.json` | 文案 |
| `public/favicon.svg` | 圖示 |

### 開新專案時要刪的地方

樣板為了「clone 下來就能看到完整資料流」內建了一組示範，開始寫真實功能前請刪除：

- `server/utils/demo-data.ts`
- `server/api/demo/`
- `app/pages/demo/`
- `app/composables/api/useDemoApi.ts`
- `tests/nuxt/useDemoApi.test.ts`
- `server/api/auth/login.post.ts` 中標記 `⚠️ DEMO 模式` 的區塊與 `demoLogin()`
- `i18n/locales/*.json` 中的 `demo` 與 `home.features` 區段

---

## 目錄結構

```
app/                    前端（Vue 3 + Tailwind 4）。只能呼叫 /api/*，不能直連外部服務
├─ composables/         通用封裝（useApi / useApiFetch / useApiClient / useTheme）
│  └─ api/              各功能領域的 API composable ← 頁面只跟這一層打交道
├─ pages/               畫面。不含任何 API 路徑字串
│  ├─ index.vue         你的首頁
│  └─ demo/             樣板示範，production 建置時整個移除
├─ components/          UI 元件
└─ stores/              Pinia（SSR-safe）
server/                 BFF（Nitro / h3 v1）。唯一能碰 secrets 與外部 API 的地方
shared/                 前後端共用的型別、錯誤碼、zod schema（用 #shared/* 匯入）
tests/                  unit / nuxt / e2e 三層測試
i18n/locales/           語系檔
docs/                   專案文件（README 以外的都放這裡）
```

專案文件放在 [`docs/`](./docs)：

- [開發約定](./docs/CONTRIBUTING.md) —— 不能破的規則、目錄職責、commit 規範、編輯器設定

### `server/` 的執行順序

```
請求進來
  │
  ├─ middleware/00.request-context.ts   產生 requestId、建立 child logger
  ├─ middleware/10.security-headers.ts  CSP、HSTS、X-Frame-Options…
  ├─ middleware/20.cors.ts              CORS 白名單（預設不開放跨域）
  ├─ middleware/30.rate-limit.ts        流量限制
  ├─ middleware/40.body-guard.ts        body 大小與 Content-Type 檢查
  ├─ middleware/50.csrf.ts              CSRF double-submit 驗證
  │
  ├─ api/**                             defineApiHandler 包裝，統一格式與錯誤處理
  │    └─ utils/upstream.ts             呼叫外部 API（timeout / retry / 斷路器）
  │
  ├─ error.ts                           兜底：確保 /api/* 永遠回 JSON 錯誤信封
  └─ plugins/10.access-log.ts           回應送出後輸出 access log
```

Nitro 的 middleware 依**檔名字母序**執行，所以用數字前綴控制順序。

---

## 前端如何呼叫 API

### 分層

```
頁面 / 元件
  └─ 領域 composable   app/composables/api/*     ← 端點路徑與型別都在這層
       └─ 通用封裝      useApiFetch / useApi
            └─ 底層     useApiClient（SSR cookie 轉發、CSRF、錯誤正規化）
                 └─ BFF /api/*
```

**頁面裡不該出現任何 API 路徑字串。** 每個功能領域收斂成一支 composable，
放在 `app/composables/api/`（巢狀目錄的自動匯入已在 `nuxt.config.ts` 開啟，
使用時不需要 import）：

```ts
// ❌ 端點散落在各個頁面，後端改路徑時要翻遍整個專案
const { data } = useApiFetch<DemoItem[]>('/demo/list', { query: { page } })

// ✅ 收斂到領域 composable，改路徑只要改一個檔案
const { data } = useDemoItems({ page })
```

附帶的好處：型別只寫一次、預設參數（例如 `pageSize`）集中管理不會各頁不一致、
可以只測這一層而不必掛載整個頁面。

參考實作：`app/composables/api/useDemoApi.ts`、`app/composables/api/useAuth.ts`。

### 命名慣例

| 前綴                     | 底層                    | 什麼時候用                     |
| ------------------------ | ----------------------- | ------------------------------ |
| `useXxxs()` / `useXxx()` | `useApiFetch`（宣告式） | 進頁面就要有的資料，會參與 SSR |
| `useXxxActions()`        | `useApi`（命令式）      | 使用者按了才發生的操作         |

分成兩種是因為底層機制不同：宣告式的必須在 `setup` 中呼叫；
命令式的可以在事件處理函式中隨時呼叫。混在一起會讓使用者搞不清楚哪些能在哪裡用。

### 底下的兩種通用封裝

寫領域 composable 時會用到這兩支。判斷原則：

> 資料是「畫面的一部分」→ 方式 A；是「動作的結果」→ 方式 B。

### 方式 A：`useApiFetch`（宣告式，SSR 首選）

進頁面就要有的資料。SSR 時在伺服器端取好、寫進 payload，瀏覽器不會重打。

```vue
<script setup lang="ts">
const page = ref(1)
const {
  data: items,
  pagination,
  pending,
  error,
  refresh,
} = useApiFetch<DemoItem[]>(
  '/demo/list',
  { query: { page, pageSize: 20 } }, // page 改變時自動重抓
)
</script>
```

### 方式 B：`useApi`（命令式，事件觸發）

使用者操作才發生的請求。**不要**在 `<script setup>` 頂層呼叫它取初始資料。

```vue
<script setup lang="ts">
const { post, loading, error } = useApi()

async function submit() {
  try {
    const created = await post<DemoItem>('/demo/items', form)
    await navigateTo(`/demo/${created.id}`)
  } catch {
    // error ref 已自動更新，模板可直接顯示 error.message / error.fieldErrors
  }
}
</script>
```

> 上面兩段是**領域 composable 內部**的寫法。頁面應該呼叫 `useDemoItems()`
> 這類領域 composable，而不是直接用 `useApiFetch` / `useApi`。

完整的使用說明與更多範例寫在原始碼的 JSDoc 中：

- `app/composables/api/useDemoApi.ts`（領域層的參考實作）
- `app/composables/useApiFetch.ts`
- `app/composables/useApi.ts`
- `app/composables/useApiClient.ts`（底層，處理 SSR cookie 轉發與 CSRF）

`app/pages/demo/index.vue` 同時使用了兩種方式，可以當成活的範例。

---

## 統一回傳格式

BFF 的每個 JSON 回應都必定是這兩種形狀之一 —— 包含 404、500 與 middleware 拋出的錯誤。

```jsonc
// 成功
{
  "success": true,
  "data": { },
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

前端拿到的 `data` 已經拆封過，錯誤則統一轉成 `ApiError`（有 `code` / `message` /
`fieldErrors` / `requestId`）。錯誤碼清單見 `shared/constants/error-codes.ts`。

### 寫一支新端點

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

**最核心的一條**：外部 API 的 access token 只存在 BFF 的加密 session cookie 中。
瀏覽器拿到的是密文，前端 JavaScript 因為 `httpOnly` 也讀不到。
就算發生 XSS，攻擊者也偷不走 token。這一點有端對端測試把關
（`tests/e2e/bff.test.ts` 的「認證：token 絕不離開 Node 層」）。

### 想要更嚴格的 CSP

目前 `script-src` 含 `'unsafe-inline'`，因為 Nuxt 的 SSR payload 是 inline script。
要拿掉它需要 nonce 機制，建議直接改用
[`nuxt-security`](https://nuxt-security.vercel.app/) 模組，
並移除 `server/middleware/10.security-headers.ts`。

---

## 日誌

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

請求生命週期內**一律使用 `event.context.logger`**，它已經綁好 `requestId`，
同一次請求的所有 log（含對外部 API 的呼叫）都串得起來：

```ts
event.context.logger.info({ orderId }, 'order created')
```

`requestId` 同時出現在回應標頭 `x-request-id` 與 body 的 `meta.requestId` 中，
使用者回報問題時提供這串 ID 就能撈出完整軌跡。

> production 刻意不掛 pino transport，直接寫 stdout 由容器的 log collector 處理 ——
> 這是 pino 官方建議，也避開 Nitro 打包後 worker thread transport 會失效的問題。

---

## 測試

```bash
pnpm test          # 全部（約 5 秒 + e2e 建置時間）
pnpm test:unit     # 純邏輯，~150ms
pnpm test:nuxt     # 元件與 composable，~1s
pnpm test:e2e      # 端對端，會實際建置並啟動伺服器
pnpm test:coverage # 覆蓋率報告
```

| 層級          | 環境             | 測什麼                                                  |
| ------------- | ---------------- | ------------------------------------------------------- |
| `tests/unit/` | node             | 錯誤轉換、回應格式、斷路器、schema                      |
| `tests/nuxt/` | nuxt + happy-dom | composable 行為、元件渲染與無障礙屬性                   |
| `tests/e2e/`  | node             | 真的建置並啟動 Nuxt，驗證前端 → BFF → 外部 API 完整鏈路 |

e2e 用 `tests/mocks/upstream-server.ts` 起一個**真實的 HTTP stub** 當外部 API。
之所以不用 MSW，是因為 Nuxt 伺服器跑在另一個 process，測試 process 裡的
fetch 攔截影響不到它。元件層測試則用 Nuxt 官方的 `registerEndpoint`。

---

## 部署

```bash
docker build -t my-app .
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=... \
  -e NUXT_API_BASE_URL=https://api.example.com \
  my-app
```

### Kubernetes

```yaml
terminationGracePeriodSeconds: 30 # 必須大於 SHUTDOWN_DRAIN_MS
readinessProbe:
  httpGet: { path: /api/ready, port: 3000 }
  periodSeconds: 5
livenessProbe:
  httpGet: { path: /api/health, port: 3000 }
  periodSeconds: 10
```

`/api/health` 與 `/api/ready` **語意不同，不可混用**：
liveness 失敗會讓 K8s 重啟 Pod，所以它絕不檢查外部依賴
（否則資料庫抖動時所有 Pod 會同時重啟）。詳見兩個檔案的註解。

收到 SIGTERM 後，`/api/ready` 會立刻回 503 讓負載平衡器把流量移走，
等 `SHUTDOWN_DRAIN_MS` 之後才真正關閉，滾動更新時不會掉請求。

### 多實例部署

把 rate limit 與 cache 的 storage 換成 Redis，業務程式碼一行都不用動：

```ts
// nuxt.config.ts
nitro: {
  storage: {
    ratelimit: { driver: 'redis', url: process.env.REDIS_URL },
    cache: { driver: 'redis', url: process.env.REDIS_URL },
  },
}
```

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

> ⚠️ Nuxt 4.5 底層仍是 **h3 v1**（h3 v2 尚在 RC）。
> 寫 `server/` 程式碼時請參照 h3 v1 的 API，不要套用 v2 的寫法。

### 刻意沒有放進來的東西

避免樣板過胖，以下留給各專案自行決定：
`@nuxt/image`、sitemap / robots、OpenTelemetry、Sentry、UI 元件庫。
接入點都留好了（`server/utils/logger.ts` 可加 OTel、`nuxt.config.ts` 加模組即可）。

---

## 指令一覽

| 指令                           | 用途                              |
| ------------------------------ | --------------------------------- |
| `pnpm dev`                     | 開發伺服器                        |
| `pnpm build`                   | 建置 production 產物到 `.output/` |
| `pnpm start`                   | 執行建置產物                      |
| `pnpm lint` / `lint:fix`       | ESLint                            |
| `pnpm format` / `format:check` | Prettier                          |
| `pnpm typecheck`               | TypeScript 型別檢查               |
| `pnpm test`                    | 全部測試                          |

Git hooks（husky）：commit 前跑 lint-staged、驗證 commit 訊息格式，
push 前跑型別檢查與快速測試。

編輯器存檔時的自動格式化（ESLint + Prettier）已設定在 `.vscode/`，
設定方式與 JetBrains 的對應選項見 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md#編輯器設定存檔自動格式化)。
