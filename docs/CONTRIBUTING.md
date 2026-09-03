# 開發約定

> 本檔案位於 `docs/`。README 以外的專案文件都放這個目錄，新增文件時請一併在
> [README 的目錄結構](../README.md#目錄結構) 加上連結。

## 開發流程（最優先）

**這條的優先級高於本文件其他所有規則。** 先有規格，再有測試，最後才寫實作。

### 有規格時：規格驅動開發（SDD）

```
規格  →  測試  →  開發
```

1. **規格**：先把要做什麼寫下來——輸入、輸出、錯誤情境、邊界條件。
   規格文件放在 `docs/`，或是需求單／issue 的連結也可以，重點是**寫在程式碼之外、
   而且動手前就存在**。
2. **測試**：依規格寫測試。此時測試應該是**紅的**（失敗），因為功能還不存在。
   紅燈本身就是在驗證「這個測試真的有在測東西」。
3. **開發**：寫到測試變綠為止。不多寫規格沒要求的東西。

規格與實作對不上時，**先改規格再改程式碼**，不要讓程式碼默默偏離規格。

### 沒有規格時：測試驅動開發（TDD）

臨時的實驗、vibe coding、探索性的小功能，沒有正式規格也可以，
但**測試先寫這件事不能省**：

```
測試  →  開發
```

寫測試的當下，你其實就是在把腦中那份規格具體化——什麼樣的輸入該得到什麼結果。
差別只在於它沒有被寫成獨立文件，而是直接長在 `tests/` 裡。

### 為什麼要求這件事

- 先寫測試逼你先想清楚介面（要收什麼參數、回傳什麼形狀），
  而不是先寫完實作再回頭把測試湊出來。
- 補寫的測試通常只是在複述實作的行為，實作錯了測試也跟著錯，抓不到 bug。
- 這是個會被大量專案 fork 的樣板。實作可以各自替換，
  但「行為的定義」必須留在測試裡，否則衍生專案改壞了沒人知道。

實務上一定會有例外（改錯字、調 log 訊息、純排版）。
例外是例外，不是預設值——寫程式碼之前先問自己「這個行為的測試在哪」。

該寫哪一層的測試見 [測試要求](#測試要求)。

## 環境需求

- Node.js 22+（見 `.nvmrc`）
- pnpm 10+（`corepack enable` 即可）

## 編輯器設定（存檔自動格式化）

`.vscode/settings.json` 已經設定好，**開啟專案時 VS Code 會提示安裝必要的擴充套件**
（見 `.vscode/extensions.json`），裝完就會在存檔時自動整理程式碼：

| 工具     | 負責       | 存檔時的行為                                                   |
| -------- | ---------- | -------------------------------------------------------------- |
| ESLint   | 程式碼品質 | `source.fixAll.eslint` 自動修正可修的問題（例如 Vue 屬性順序） |
| Prettier | 排版       | 縮排、引號、換行一律重排                                       |

兩者不會打架 —— `eslint-config-prettier` 已經關掉所有與 Prettier 衝突的排版規則。
VS Code 會先跑 ESLint 修正、再跑 Prettier 排版，結果穩定收斂。

必裝的擴充套件：

- `dbaeumer.vscode-eslint`
- `esbenp.prettier-vscode`
- `Vue.volar`（Vue 3 語言支援；請確認**沒有**裝舊版的 Vetur，兩者會衝突）

> ⚠️ 有些規則刻意**不會**被自動修正，例如 `no-unused-vars`（刪程式碼有風險）
> 與 `eqeqeq`（在沒有型別資訊時無法確保 `==` 換成 `===` 是安全的）。
> 這些要自己處理，`pnpm lint` 會列出來。

### 使用 JetBrains（WebStorm / IntelliJ）

JetBrains 的對應設定存在 `.idea/`，通常不進版控，所以要各自在 UI 開啟：

- **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**
  選 _Automatic ESLint configuration_，勾選 **Run eslint --fix on save**
- **Settings → Languages & Frameworks → JavaScript → Prettier**
  勾選 **Run on save**，檔案範圍設為 `{**/*,*}.{ts,vue,json,md,css}`

專案根目錄的 `.editorconfig` 會自動被 JetBrains 讀取，縮排與換行符號不需額外設定。

## 幾條不能破的規則

### 1. 前端不直連外部 API

所有外部呼叫都必須經過 `server/`。前端只能打 `/api/*`。

CSP 的 `connect-src 'self'` 會在瀏覽器層直接擋下違規的嘗試，
但請不要靠它發現問題 —— 一開始就走 BFF。

### 2. Secrets 只放在 `runtimeConfig` 頂層

`runtimeConfig.public` 底下的所有東西都會被打包進瀏覽器。
API key、session 密鑰、任何 token，一律放頂層。

### 3. 頁面不直接呼叫 API

頁面裡不該出現任何 API 路徑字串，也不該直接使用 `useApiFetch` / `useApi`。
每個功能領域收斂成一支 composable，放在 `app/composables/api/`：

```ts
// ❌ 端點散落在頁面裡
// pages/orders/index.vue
const { data } = useApiFetch<Order[]>('/orders', { query: { page } })
// pages/dashboard.vue
const { data } = useApiFetch<Order[]>('/orders', { query: { page: 1, pageSize: 5 } })

// ✅ app/composables/api/useOrderApi.ts
const ENDPOINTS = { list: '/orders', detail: (id: string) => `/orders/${id}` } as const

export function useOrders(options: { page?: MaybeRefOrGetter<number> } = {}) {
  const page = computed(() => toValue(options.page) ?? 1)
  return useApiFetch<Order[]>(ENDPOINTS.list, { query: { page, pageSize: 20 } })
}

export function useOrderActions() {
  const { post, del, loading, error } = useApi()
  return {
    loading,
    error,
    createOrder: (payload: OrderInput) => post<Order>(ENDPOINTS.list, payload),
    cancelOrder: (id: string) => del(ENDPOINTS.detail(id)),
  }
}
```

理由：後端改路徑、加必填參數、換分頁欄位名稱時，只要改一個檔案。
順帶讓型別只寫一次、預設參數不會各頁不一致、也能只測這一層。

命名慣例：宣告式（SSR、進頁面就要的資料）用 `useXxxs()` / `useXxx()`，
命令式（使用者操作觸發）用 `useXxxActions()`。兩者底層機制不同，
不要混在同一個 composable 裡。

參考實作：`app/composables/api/useDemoApi.ts`、`app/composables/api/useAuth.ts`。

> 巢狀目錄的自動匯入已在 `nuxt.config.ts` 的 `imports.dirs` 開啟，
> 新增的 composable 不需要寫 import 就能用。

### 4. 示範內容一律放在 `/demo` 底下

樣板的示範頁面全部在 `app/pages/demo/`，production 建置時整個路由樹會被移除
（`nuxt.config.ts` 的 `pages:extend`），對應的 `/api/demo/*` 由
`server/middleware/15.demo-guard.ts` 擋下。

新增示範或實驗性頁面時請放進這個目錄，不要放在 `app/pages/` 頂層 ——
否則它會跟著進 production bundle。

登入頁路徑不要寫死，改讀 `runtimeConfig.public.loginPath`。

### 5. 端點一律用 `defineApiHandler` 包裝

它負責統一成功／錯誤格式與錯誤日誌。直接用 `defineEventHandler` 會讓
這支端點的回傳格式與其他端點不一致，前端就得寫特例。

### 6. 錯誤用 `throw`，不要用回傳值表達

```ts
// ✅
if (!order) throw new AppError(ERROR_CODE.NOT_FOUND, '找不到這筆訂單')

// ❌ 每一層都得檢查回傳值，很容易漏
if (!order) return { error: 'not found' }
```

### 7. 輸入與上游回應都要驗證

輸入用 `validateBody` / `validateQuery` / `validateParams`；
上游回應用 `validateUpstream`。schema 放 `shared/schemas/`，前後端共用。

### 8. Log 用 `event.context.logger`

不要直接用匯入的 `logger` —— 那樣會少掉 `requestId`，出事時追不到。

## 目錄該放哪些東西

| 目錄                            | 放什麼                                              | 不要放什麼                                      |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `app/composables/api/`          | 各功能領域的 API composable（端點路徑只出現在這裡） | 畫面邏輯                                        |
| `app/pages/`、`app/components/` | 畫面與互動                                          | API 路徑字串、直接使用 `useApiFetch` / `useApi` |
| `app/`                          | 元件、composable、Pinia store                       | 任何 secret、直接呼叫外部 API 的程式碼          |
| `server/`                       | BFF 邏輯、外部 API 呼叫                             | 瀏覽器 API（`window`、`document`）              |
| `shared/`                       | 型別、錯誤碼、zod schema                            | 環境專屬的程式碼（Node 或 DOM 都不行）          |

`shared/` 的程式碼會同時被兩邊編譯，所以不能依賴任何執行環境。
TypeScript 已經分成四個 project 幫你把關，寫錯會在 `pnpm typecheck` 時被抓到。

## Commit 訊息

Conventional Commits，格式 `<type>(<scope>): <subject>`：

```
feat(api): 新增訂單查詢端點
fix(auth): 修正 session 過期後未導向登入頁
docs(readme): 補上 Docker 部署說明
```

可用的 type 見 `commitlint.config.mjs`。commit-msg hook 會自動驗證。

## 測試要求

| 改了什麼                                  | 至少要有                           |
| ----------------------------------------- | ---------------------------------- |
| `server/utils/` 的純函式                  | `tests/unit/`                      |
| 領域 composable（`app/composables/api/`） | `tests/nuxt/`                      |
| composable 或元件                         | `tests/nuxt/`                      |
| 新的 API 端點                             | `tests/e2e/`                       |
| 資安相關（`server/middleware/`）          | `tests/e2e/`，並在 PR 說明影響範圍 |

寫測試時避免斷言時序（例如「呼叫後當下 pending 應為 true」），
那種測試會隨機失敗。斷言**最終狀態**。

順序上，這些測試應該在對應的實作**之前**就存在，見 [開發流程](#開發流程最優先)。

## 新增環境變數的完整流程

1. `nuxt.config.ts` 的 `runtimeConfig` 加上鍵與預設值
2. `.env.example` 加上說明（標註是否必填）
3. 若為必填，在 `server/plugins/00.env-validate.ts` 的 schema 加上驗證
4. README 若有相關章節也一併更新

漏掉第 3 步的話，設定缺失會拖到執行期才爆，那正是這個機制想避免的事。

## 送出 PR 前

```bash
pnpm lint && pnpm typecheck && pnpm test
```

pre-push hook 會跑前兩項與快速測試，e2e 留給 CI。
