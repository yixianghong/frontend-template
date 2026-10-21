// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

/**
 * ESLint 設定（flat config）。
 *
 * `withNuxt()` 會帶入 Nuxt 官方的規則集：Vue 3、TypeScript、
 * 以及 Nuxt 專屬規則（例如禁止在 server 端使用瀏覽器 API）。
 *
 * `eslint-config-prettier` 放在**最後**，用來關掉所有與 Prettier 衝突的
 * 排版類規則 —— 排版交給 Prettier，ESLint 只管程式碼品質。
 */
export default withNuxt(
  {
    rules: {
      // ── 型別安全 ──
      // 未使用的變數視為錯誤，但允許以底線開頭的參數（表達「刻意忽略」）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 樣板中偶爾需要 any（例如第三方函式庫缺型別），降為警告而非錯誤
      '@typescript-eslint/no-explicit-any': 'warn',

      // 註：`@typescript-eslint/consistent-type-imports` 需要「帶型別資訊的 linting」
      // （typed linting），會讓 `pnpm lint` 從數秒變成數十秒。
      // 這個樣板改用 `pnpm typecheck` 把關型別，lint 只做快速的語法與品質檢查。
      // 若專案願意付出這個時間成本，可在 nuxt.config.ts 的 eslint 選項開啟 typed linting。

      // ── Vue ──
      // 元件名稱用多個單字，避免與 HTML 原生標籤衝突
      'vue/multi-word-component-names': 'error',
      // props 一律宣告型別與預設值
      'vue/require-default-prop': 'off',
      // 模板中的屬性順序統一，diff 更好讀
      'vue/attributes-order': 'warn',

      // ── 一般 ──
      // 正式程式碼不留 console，但 warn/error 允許（server 端的 fallback 輸出）
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // 頁面、版面與錯誤頁的檔名由 Nuxt 的路由慣例決定（`index.vue`、`[id].vue`、
    // `default.vue`），不可能也不應該改成多單字命名
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue', 'app/error.vue', 'app/app.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // 規則 3（docs/CONTRIBUTING.md）：頁面與元件不直接呼叫 API。
    //
    // 端點路徑只能出現在 app/composables/api/，這樣後端改路徑、加必填參數、
    // 換分頁欄位名稱時只要改一個檔案。這是純語法層的約定，所以交給 ESLint 而不是
    // 靠 review 時記得看（判斷題才交給 .github/AI_REVIEW.md 的 AI reviewer）。
    //
    // ⚠️ 只作用於 <script>，不涵蓋 template 運算式 —— vue-eslint-parser 的
    // template AST 不走這個選擇器。template 裡直接打 API 的寫法極少，剩下的由 review 補。
    files: ['app/pages/**/*.vue', 'app/components/**/*.vue', 'app/layouts/**/*.vue'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name=/^(useApiFetch|useApi)$/]',
          message:
            '頁面與元件不直接呼叫 API。請收斂成 app/composables/api/ 的領域 composable，見 docs/CONTRIBUTING.md 規則 3。',
        },
        {
          selector: 'Literal[value=/^\\/api\\//]',
          message: 'API 路徑字串只能出現在 app/composables/api/，見 docs/CONTRIBUTING.md 規則 3。',
        },
      ],
    },
  },
  {
    // 規則 5（docs/CONTRIBUTING.md）：端點一律用 defineApiHandler 包裝。
    //
    // 它負責統一成功／錯誤格式與錯誤日誌；直接用 defineEventHandler 會讓這支端點的
    // 回傳格式與其他端點不一致，前端就得為它寫特例。
    //
    // 只限 server/api 與 server/routes —— middleware 與 plugins 本來就該用
    // defineEventHandler / defineNitroPlugin，不在這條規則的管轄範圍。
    files: ['server/api/**/*.ts', 'server/routes/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='defineEventHandler']",
          message:
            '端點請用 defineApiHandler 包裝以統一回傳格式，見 docs/CONTRIBUTING.md 規則 5。需要 Nitro 快取時改用 defineCachedEventHandler，並在這一行加上 eslint-disable 與理由。',
        },
      ],
    },
  },
  {
    // 測試檔案放寬限制：測試中常需要 any 與 console
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    // 命令列腳本的輸出就是它的介面，console 是正常用法而非遺漏的 debug
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // server 端本來就在 Node 環境，允許直接使用 console 作為 logger 尚未就緒時的後備
    files: ['server/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 必須放最後：關閉所有與 Prettier 衝突的排版規則
  prettier,
)
