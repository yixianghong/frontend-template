/**
 * `check-conventions` 的純解析邏輯。
 *
 * 刻意與 `../check-conventions.mjs` 分開：那邊負責跑 git 與輸出，這邊只有不碰 I/O
 * 的函式，所以可以直接在 `tests/unit/` 測。這幾個解析器是整支腳本最容易壞的部分
 * （大括號配對、camelCase ↔ SNAKE_CASE 的轉換），行為必須被測試釘住。
 *
 * 零相依是刻意的 —— 這支腳本要能在 `node_modules` 還沒安裝好的環境直接 `node` 執行。
 */

/** 看起來像機密的鍵名。放在 `runtimeConfig.public` 底下就會被打包進瀏覽器。 */
export const SECRET_NAME_PATTERN = /secret|password|token|credential|api_?key|private/i

/**
 * 把註解、字串與 regex 字面值的內容抹成空白，只留下程式碼結構。
 *
 * 後面要用大括號配對找出 `runtimeConfig` 的範圍，而註解、字串或 regex 裡的 `{`
 * 會把配對算錯（這個專案的註解量很大，一定會踩到）。抹的時候保留原本的長度與換行，
 * 所以處理後的字元位置仍然對得上原始位置。
 *
 * regex 不能只靠「看到 / 就跳過」—— `/^https?:\/\//` 的最後兩個字元剛好是 `//`，
 * 不處理的話會被當成行註解，該行剩下的部分（可能包含結構用的大括號）會一起被抹掉，
 * 配對就錯了，而且是靜默地錯。
 *
 * @param {string} src
 * @returns {string}
 */
export function stripNoise(src) {
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }

  /** 上一個屬於程式碼的非空白字元，用來判斷 `/` 是 regex 開頭還是除法。 */
  let prev = ''
  let i = 0

  while (i < src.length) {
    const two = src.slice(i, i + 2)

    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(i, stop)
      i = stop
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i]
      let j = i + 1
      while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1
      blank(i + 1, Math.min(j, src.length))
      i = Math.min(j + 1, src.length)
      prev = quote
    } else if (src[i] === '/' && (prev === '' || REGEX_CAN_FOLLOW.has(prev))) {
      const end = regexEnd(src, i)
      if (end === -1) {
        // 找不到收尾（或跨行了）—— 表示判斷錯了，這個 / 其實是除法
        prev = '/'
        i++
      } else {
        blank(i + 1, end) // 只抹內容，兩個斜線留著當佔位，它們不是大括號
        i = end + 1
        prev = '/'
      }
    } else {
      if (!/\s/.test(src[i])) prev = src[i]
      i++
    }
  }

  return out.join('')
}

/**
 * regex 字面值只能出現在「需要運算元」的位置。這個集合涵蓋設定檔會出現的情況：
 * 物件的值（`:`）、陣列元素與引數（`,` `(` `[`）、賦值（`=`）、運算子。
 * 前一個字元是識別字或 `)` 的時候，`/` 是除法。
 */
const REGEX_CAN_FOLLOW = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '^',
  '<',
  '>',
  '~',
])

/**
 * 找 regex 字面值的收尾斜線位置，找不到回傳 -1。
 *
 * 字元類別裡的 `/` 不算收尾（`/[/]/` 是合法的），跨行也不算 ——
 * regex 不能跨行，掃到換行就表示前面的判斷是錯的。
 *
 * @param {string} src
 * @param {number} start 開頭斜線的位置
 * @returns {number}
 */
function regexEnd(src, start) {
  let inClass = false

  for (let j = start + 1; j < src.length && src[j] !== '\n'; j++) {
    const char = src[j]
    if (char === '\\') {
      j++
      continue
    }
    if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (char === '/' && !inClass) return j
  }

  return -1
}

/**
 * 取出 `runtimeConfig` 的鍵名，分成頂層與 `public` 兩組。
 *
 * 只收「物件直接子層」的鍵 —— 巢狀物件內部的鍵不算，否則 `public` 裡隨便一個
 * 物件型設定的子鍵都會被誤判成新的頂層設定。
 *
 * @param {string} src `nuxt.config.ts` 的原始內容
 * @returns {{ top: Set<string>, pub: Set<string> }}
 */
export function runtimeConfigKeys(src) {
  const clean = stripNoise(src)
  const match = /\bruntimeConfig\s*:\s*\{/.exec(clean)
  if (!match) return { top: new Set(), pub: new Set() }

  const start = match.index + match[0].length - 1 // 指向那個 `{`
  const top = new Set()
  const pub = new Set()

  let depth = 0
  let publicDepth = -1

  for (let i = start; i < clean.length; i++) {
    const char = clean[i]

    if (char === '{') {
      depth++
      continue
    }
    if (char === '}') {
      depth--
      if (depth < publicDepth) publicDepth = -1
      if (depth === 0) break
      continue
    }

    // 鍵名必須是某一行（或某個 `{` / `,`）之後的第一個 token，
    // 這樣才不會把 `foo: bar ? baz : qux` 裡的東西當成鍵
    if (!/[\n{,]/.test(clean[i - 1] ?? '\n')) continue
    const key = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(clean.slice(i, i + 80))
    if (!key) continue

    const name = key[1]
    if (depth === 1) {
      if (name === 'public') {
        // 只有 public 真的是物件字面值時才記下它的深度 —— 否則 runtimeConfig 底下
        // 別的巢狀物件（例如 nitro: { ... }）的子鍵會被誤算成 public 的設定
        if (/^\s*\{/.test(clean.slice(i + key[0].length))) publicDepth = 2
      } else {
        top.add(name)
      }
    } else if (depth === publicDepth) {
      pub.add(name)
    }
  }

  return { top, pub }
}

/**
 * 取出 `.env.example` 的變數名，以及它是否標了 `[必填]`。
 *
 * `[必填]` 寫在變數上方的註解區塊裡（見 `.env.example` 開頭的說明），
 * 所以要往上收集連續的註解行來判斷。空行會中斷註解區塊 ——
 * 區塊標題（`# ── Session ──`）與變數之間隔了空行，不該被誤算成那個變數的說明。
 *
 * @param {string} src
 * @returns {Map<string, { required: boolean }>}
 */
export function envExampleVars(src) {
  /** @type {Map<string, { required: boolean }>} */
  const vars = new Map()
  let comment = []

  for (const line of src.split('\n')) {
    if (line.startsWith('#')) {
      comment.push(line)
      continue
    }
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    if (match) vars.set(match[1], { required: comment.join('\n').includes('[必填]') })
    comment = []
  }

  return vars
}

/**
 * `sessionPassword` → `SESSION_PASSWORD`。
 *
 * Nuxt 的 runtimeConfig ↔ 環境變數命名規則，見 `nuxt.config.ts` 的註解。
 *
 * @param {string} key
 * @returns {string}
 */
export const toEnvName = (key) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

/**
 * `SESSION_PASSWORD` → `sessionPassword`（`toEnvName` 的反向）。
 *
 * @param {string} name 已去掉 `NUXT_` / `NUXT_PUBLIC_` 前綴的變數名
 * @returns {string}
 */
export const toConfigKey = (name) =>
  name.toLowerCase().replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())

/**
 * 找逃生門。硬錯會有例外（例如新增的設定鍵是建置期推導的，本來就沒有環境變數），
 * 標記獨立寫成一行即可放行；理由會被印出來，所以不會變成無聲的繞過。
 *
 * ## 為什麼要求「獨立一行」
 *
 * 這個函式掃的是 commit 訊息與 PR 描述這種自由文字，所以**說明這個標記怎麼用，
 * 本身就會把它武裝起來** —— PR 範本的提示文字、CONTRIBUTING 的說明、
 * 甚至講解這個功能的 commit 訊息，都會被當成真的要放行。
 *
 * 一旦被誤觸發，所有硬錯都降成 warning 並 exit 0：把關看起來還在運作，
 * 實際上已經失效。這比直接報錯糟得多，因為沒有人會發現。
 *
 * 區分方式刻意用結構而不是關鍵字黑名單（黑名單永遠會漏）：
 * 說明用法一律寫在句子中間或 code span 裡，真的要用就讓它獨立成一行。
 *
 * @param {string} text commit 訊息與 PR 描述
 * @returns {string | null} 放行的理由，沒寫就是 null
 */
export function findSkipReason(text) {
  // 先拿掉 code block 與 code span —— 文件需要「提到」這個標記，提到不等於使用，
  // 而文件提到它的時候幾乎都包在反引號裡
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

  // 標記必須從行首開始（允許縮排），理由不跨行
  return /^[ \t]*\[skip-policy:\s*([^\]\n]+)\]/m.exec(prose)?.[1]?.trim() ?? null
}
