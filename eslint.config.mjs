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
    // 測試檔案放寬限制：測試中常需要 any 與 console
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
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
