/**
 * Commit 訊息規範（Conventional Commits）。
 *
 * 格式：`<type>(<scope>): <subject>`
 *
 * 範例：
 *   feat(api): 新增訂單查詢端點
 *   fix(auth): 修正 session 過期後未導向登入頁
 *   docs(readme): 補上 Docker 部署說明
 *   chore(deps): 升級 Nuxt 至 4.5.2
 *
 * 好處是 commit 歷史可以被機器解析，能自動產生 CHANGELOG 與語意化版號。
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修 bug
        'docs', // 只改文件
        'style', // 排版，不影響邏輯
        'refactor', // 重構，非新功能也非修 bug
        'perf', // 效能改善
        'test', // 新增或修改測試
        'build', // 建置系統或相依套件
        'ci', // CI 設定
        'chore', // 其他雜項
        'revert', // 還原先前的 commit
      ],
    ],
    // 允許中文 subject，所以不限制大小寫
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}
