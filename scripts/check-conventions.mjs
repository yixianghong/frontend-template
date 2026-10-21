#!/usr/bin/env node
/**
 * 約定檢查 —— 抓 ESLint 看不到的「改了 A 卻沒改 B」。
 *
 * ESLint 一次只看一個檔案，所以它無法知道「`nuxt.config.ts` 多了一個設定鍵，
 * 但 `.env.example` 沒跟上」這類跨檔案的約定有沒有被遵守。這支腳本讀 merge-base
 * diff，把 `docs/CONTRIBUTING.md` 裡能機械化的那幾條約定檢查掉。
 *
 * ## 為什麼分成「硬錯」與「軟提醒」
 *
 * 能百分之百確定的事才可以擋人。這裡的硬錯都屬於「漏掉會在 runtime 才爆」的類型 ——
 * 正是 `server/plugins/00.env-validate.ts` 想避免的那種失敗。
 *
 * 軟提醒則是「這個改動需不需要測試」這類**判斷題**。純 refactor、改錯字不該被擋下來，
 * 所以軟提醒只負責把事實攤在 PR 上，由 reviewer 去判斷（見 `.github/AI_REVIEW.md`）。
 * 把判斷題做成硬 gate，結果一定是有人去把它關掉。
 *
 * ## 逃生門
 *
 * 硬錯會有例外（例如新增的設定鍵是建置期推導的，本來就沒有對應的環境變數）。
 * 在 commit 訊息或 PR 描述裡把 skip-policy 標記**獨立寫成一行**即可放行，
 * 格式與理由見 `lib/conventions.mjs` 的 `findSkipReason`。
 *
 * ## 用法
 *
 *     node scripts/check-conventions.mjs [base-ref]
 *
 * base-ref 預設是 `origin/${GITHUB_BASE_REF}`（CI）或 `origin/main`（地端）。
 * 純解析邏輯在 `scripts/lib/conventions.mjs`，測試在 `tests/unit/conventions.test.ts`。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  SECRET_NAME_PATTERN,
  envExampleVars,
  findSkipReason,
  runtimeConfigKeys,
  toConfigKey,
  toEnvName,
} from './lib/conventions.mjs'

const ENV_EXAMPLE = '.env.example'
const NUXT_CONFIG = 'nuxt.config.ts'
const ENV_VALIDATE = 'server/plugins/00.env-validate.ts'

/** 在 GitHub Actions 裡要輸出 annotation 格式，才會標在 PR 的檔案上。 */
const inActions = process.env.GITHUB_ACTIONS === 'true'

/** @type {{ message: string, file?: string }[]} */
const errors = []
/** @type {{ message: string, file?: string }[]} */
const warnings = []

const fail = (message, file) => errors.push({ message, file })
const warn = (message, file) => warnings.push({ message, file })

/** 跑 git 並回傳 stdout；失敗回傳 null，由呼叫端決定要不要當成致命錯誤。 */
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return null
  }
}

/** 讀 merge-base 當時的檔案內容；該檔案在當時不存在就回傳空字串。 */
const atBase = (mergeBase, path) => git('show', `${mergeBase}:${path}`) ?? ''

/** 讀工作目錄現在的內容（而非 HEAD），這樣地端改到一半也能檢查。 */
function atHead(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 改動範圍
// ─────────────────────────────────────────────────────────────────────────

const baseRef =
  process.argv[2] ||
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main')

const mergeBase = git('merge-base', baseRef, 'HEAD')?.trim()

if (!mergeBase) {
  // 淺層 clone，或這個 ref 根本不存在（剛複製的樣板還沒有 origin）。
  // 這不代表約定被違反，只代表我們算不出改動範圍，所以不該讓 CI 變紅。
  console.log(`[約定檢查] 找不到 ${baseRef} 與 HEAD 的共同祖先，跳過檢查。`)
  console.log('           CI 請確認 actions/checkout 設了 fetch-depth: 0。')
  process.exit(0)
}

/** 改動的檔案：路徑 → `A`（新增）/ `M`（修改）/ `D`（刪除）。 */
const changed = new Map()

const collect = (output) => {
  for (const line of (output ?? '').split('\n')) {
    if (!line.trim()) continue
    const [status, ...rest] = line.split('\t')
    // 改名是 `R100\told\tnew`，取最後一個路徑當作現在的位置
    changed.set(rest.at(-1), status[0])
  }
}

collect(git('diff', '--name-status', `${mergeBase}...HEAD`))

// 地端常常是「還沒 commit 就想先檢查」，所以把工作目錄的改動也算進來。
// CI 上工作目錄與 HEAD 相同，這兩段不會有任何效果。
collect(git('diff', '--name-status', 'HEAD'))
for (const path of (git('ls-files', '--others', '--exclude-standard') ?? '').split('\n')) {
  if (path.trim()) changed.set(path.trim(), 'A')
}

if (changed.size === 0) {
  console.log('[約定檢查] 沒有改動，跳過。')
  process.exit(0)
}

const addedUnder = (prefix) =>
  [...changed]
    .filter(([path, status]) => status === 'A' && path.startsWith(prefix))
    .map(([path]) => path)

const touched = (prefix) => [...changed.keys()].some((path) => path.startsWith(prefix))

// ─────────────────────────────────────────────────────────────────────────
// 硬錯：漏掉會在 runtime 才爆的事
// ─────────────────────────────────────────────────────────────────────────

if (changed.has(NUXT_CONFIG)) {
  const before = runtimeConfigKeys(atBase(mergeBase, NUXT_CONFIG))
  const after = runtimeConfigKeys(atHead(NUXT_CONFIG))
  const envVars = envExampleVars(atHead(ENV_EXAMPLE))

  const newTop = [...after.top].filter((key) => !before.top.has(key))
  const newPublic = [...after.pub].filter((key) => !before.pub.has(key))

  // 規則 2：secrets 只放 runtimeConfig 頂層。public 底下的一切都會進瀏覽器 bundle。
  for (const key of newPublic.filter((key) => SECRET_NAME_PATTERN.test(key))) {
    fail(
      `runtimeConfig.public.${key} 的名稱看起來是機密。public 底下的值會被打包進瀏覽器，` +
        '請移到 runtimeConfig 頂層（docs/CONTRIBUTING.md 規則 2）。',
      NUXT_CONFIG,
    )
  }

  // CONTRIBUTING「新增環境變數的完整流程」第 1、2 步
  for (const key of newTop) {
    const expected = `NUXT_${toEnvName(key)}`
    if (envVars.has(expected)) continue
    fail(
      `新增了 runtimeConfig.${key}，但 ${ENV_EXAMPLE} 沒有對應的 ${expected}。` +
        '設定清單要能一眼看完，見 docs/CONTRIBUTING.md「新增環境變數的完整流程」。',
      ENV_EXAMPLE,
    )
  }
  for (const key of newPublic) {
    const expected = `NUXT_PUBLIC_${toEnvName(key)}`
    if (envVars.has(expected)) continue
    fail(
      `新增了 runtimeConfig.public.${key}，但 ${ENV_EXAMPLE} 沒有對應的 ${expected}。`,
      ENV_EXAMPLE,
    )
  }
}

if (changed.has(ENV_EXAMPLE)) {
  const before = envExampleVars(atBase(mergeBase, ENV_EXAMPLE))
  const after = envExampleVars(atHead(ENV_EXAMPLE))
  const validateSrc = atHead(ENV_VALIDATE)

  for (const [name, meta] of after) {
    if (before.has(name)) continue
    // 只有必填項需要進啟動驗證；選填項缺了也能跑，不該擋人
    if (!meta.required) continue
    // 非 NUXT_ 前綴的變數（PORT、LOG_LEVEL…）不走 runtimeConfig，不在這個 schema 裡
    if (!name.startsWith('NUXT_')) continue

    const configKey = toConfigKey(name.replace(/^NUXT_(PUBLIC_)?/, ''))
    if (validateSrc.includes(configKey)) continue
    fail(
      `${name} 標了 [必填]，但 ${ENV_VALIDATE} 的 schema 沒有 ${configKey}。` +
        '漏掉這步，設定缺失會拖到執行期才爆 —— 那正是這個機制要避免的事' +
        '（docs/CONTRIBUTING.md「新增環境變數的完整流程」第 3 步）。',
      ENV_VALIDATE,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 軟提醒：來自 CONTRIBUTING 的測試要求表，但「需不需要」是判斷題
// ─────────────────────────────────────────────────────────────────────────

const newEndpoints = addedUnder('server/api/')
if (newEndpoints.length > 0 && !touched('tests/e2e/')) {
  warn(`新增了 API 端點（${newEndpoints.join('、')}）但沒有動到 tests/e2e/。`)
}

if (touched('server/middleware/')) {
  if (!touched('tests/e2e/')) {
    warn('改了 server/middleware/（資安相關）但沒有動到 tests/e2e/。')
  }
  warn('改了 server/middleware/：請在 PR 描述說明影響範圍（CONTRIBUTING 測試要求表）。')
}

const newComposables = addedUnder('app/composables/api/')
if (newComposables.length > 0 && !touched('tests/nuxt/')) {
  warn(`新增了領域 composable（${newComposables.join('、')}）但沒有動到 tests/nuxt/。`)
}

if (touched('server/utils/') && !touched('tests/unit/')) {
  warn('改了 server/utils/ 的純函式但沒有動到 tests/unit/。')
}

// ─────────────────────────────────────────────────────────────────────────
// 輸出
// ─────────────────────────────────────────────────────────────────────────

const annotation = (level, { message, file }) =>
  inActions ? `::${level}${file ? ` file=${file}` : ''}::${message}` : null

for (const item of warnings) {
  console.log(annotation('warning', item) ?? `⚠ ${item.message}`)
}

if (errors.length === 0) {
  console.log(`[約定檢查] 通過（${changed.size} 個檔案，${warnings.length} 項提醒）。`)
  process.exit(0)
}

const skipReason = findSkipReason(
  [git('log', '--format=%B', `${mergeBase}..HEAD`) ?? '', process.env.PR_BODY ?? ''].join('\n'),
)

for (const item of errors) {
  console.log(
    annotation(skipReason ? 'warning' : 'error', item) ??
      `✖ ${skipReason ? '略過' : '違反約定'}：${item.message}`,
  )
}

if (skipReason) {
  console.log(`\n[約定檢查] 以上 ${errors.length} 項被 [skip-policy] 放行，理由：${skipReason}`)
  process.exit(0)
}

console.log(
  `\n[約定檢查] ${errors.length} 項未通過。` +
    '確定是例外的話，在 commit 訊息或 PR 描述裡「獨立寫一行」skip-policy 標記即可放行。\n' +
    '格式見 docs/CONTRIBUTING.md 的「送出 PR 前」。寫在句子中間不算 ——\n' +
    '否則光是在文件裡提到這個標記，就會把所有硬錯悄悄關掉。',
)
process.exit(1)
