---
description: 依本專案約定審查當前分支的改動（與 CI 的 AI review 同一份準則）
argument-hint: '[base-ref，預設 origin/main]'
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(node scripts/check-conventions.mjs:*), Read, Grep, Glob
---

## 改動範圍

!`BASE=$1; BASE=${BASE:-origin/main}; MB=$(git merge-base "$BASE" HEAD); echo "merge-base: $MB"; echo; git --no-pager diff --stat "$MB"...HEAD -- . ':(exclude)pnpm-lock.yaml'`

## 確定性檢查的結果

!`node scripts/check-conventions.mjs $1 2>&1 | tail -20`

## 任務

審查準則見 @.github/AI_REVIEW.md，請完整讀過再開始，特別是「不要報什麼」那一節 ——
它的優先級高於你自己的判斷。

1. 用上面那個 merge-base，**自己逐檔**抓內容：
   `git diff <merge-base>...HEAD -- <檔案>`。
   不要一次抓整份 diff —— 稍大的改動就會超過單次輸出上限而被截斷，
   而截斷發生在你看到內容之前，你不會知道自己漏看了什麼。
   依上面的 `--stat` 決定看哪些檔案、以什麼順序看，程式碼優先於文件。
2. 只 review 這些改動。需要上下文時去讀相關檔案，但不要 review 沒改到的程式碼。
3. 上面「確定性檢查的結果」已經報掉的項目不要重複講。
4. 按嚴重度排序輸出，每條都要有 `file:line`、問題、後果、建議四項。
5. 沒有 Blocker 也沒有 Major 就直說，並列出你檢查過的面向。
6. **不要修改任何檔案。** 這是 review 不是 fix；要修的話我會另外叫你。
