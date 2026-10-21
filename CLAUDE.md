# CLAUDE.md

給 AI coding agent 的入口。**規則本體不寫在這裡** ——
一律以 [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) 為準，這份檔案只負責指路。
兩邊都寫一遍的話一定會漂移，到時候人看的是一份、AI 讀的是另一份。

## 這是什麼專案

Nuxt 4 + BFF 企業級樣板。前端只打 `/api/*`，所有外部呼叫都經過 `server/`。
技術棧與刻意的取捨見 [README 的技術選型](./README.md#技術選型)。

> ⚠️ Nuxt 4.5 底層仍是 **h3 v1**。寫 `server/` 時請用 v1 的 API，不要套 v2 的寫法。

## 動手之前

**先有規格，再有測試，最後才寫實作。** 這條的優先級高於其他所有規則，
細節見 [開發流程](./docs/CONTRIBUTING.md#開發流程最優先)。

沒有正式規格時（實驗、探索性小功能）也一樣要先寫測試 —— 測試就是那份規格。
寫程式碼之前先問自己「這個行為的測試在哪」。

該寫哪一層的測試見 [測試要求](./docs/CONTRIBUTING.md#測試要求)。

## 幾條不能破的規則

每一條的理由與正反例見 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md#幾條不能破的規則)，
不要只看標題就動手：

1. 前端不直連外部 API —— 一律走 `server/`
2. Secrets 只放 `runtimeConfig` 頂層 —— `public` 底下的一切都會進瀏覽器
3. 頁面與元件不直接呼叫 API —— 端點路徑只出現在 `app/composables/api/`
4. 示範與實驗內容一律放 `app/pages/demo/` —— 放頂層會進 production bundle
5. `server/api/` 的端點一律用 `defineApiHandler` 包裝
6. 錯誤用 `throw new AppError`，不要用回傳值表達
7. 輸入用 `validateBody` / `validateQuery` / `validateParams`，上游回應用 `validateUpstream`
8. Log 用 `event.context.logger`，不要用匯入的 `logger`（會掉 `requestId`）

規則 3 與 5 已經做成 ESLint 規則（見 `eslint.config.mjs`），
規則 2 與環境變數的三處同步做成 `scripts/check-conventions.mjs`。
**能用規則表達的就不要靠 review 記得看** —— 新增這類約定時請照這個順序考慮：
ESLint rule → 腳本 → 最後才是 `.github/AI_REVIEW.md` 的檢查項。

## 目錄

| 目錄                                  | 放什麼                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| `app/composables/api/`                | 各功能領域的 API composable（端點路徑只出現在這裡）                 |
| `app/pages/`、`app/components/`       | 畫面與互動，不碰 API 路徑                                           |
| `server/`                             | BFF 邏輯、外部 API 呼叫                                             |
| `shared/`                             | 型別、錯誤碼、zod schema（server 與 client 共用，不能依賴執行環境） |
| `tests/unit` `tests/nuxt` `tests/e2e` | 對應三種測試層級                                                    |
| `scripts/`                            | 零相依的命令列工具                                                  |

完整版與「不要放什麼」見 [目錄該放哪些東西](./docs/CONTRIBUTING.md#目錄該放哪些東西)。
`server/` 的檔名數字前綴決定執行順序，見 [README](./README.md#server-的執行順序)。

## 改完要跑什麼

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm check:conventions
```

commit 訊息用 Conventional Commits（`commitlint.config.mjs` 會驗）。
husky 會在 commit 前跑 lint-staged、push 前跑型別檢查與快速測試。

新增環境變數有固定的四步流程，漏掉第 3 步會讓設定缺失拖到執行期才爆：
見 [新增環境變數的完整流程](./docs/CONTRIBUTING.md#新增環境變數的完整流程)。

## Review

被要求 review 時，準則見 [`.github/AI_REVIEW.md`](./.github/AI_REVIEW.md)。
地端打 `/review` 會直接帶上當前分支的 diff 與那份準則。
