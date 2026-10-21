---
description: 依本專案約定審查當前分支的改動（與 CI 的 AI review 同一份準則）
argument-hint: '[base-ref，預設 origin/main]'
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(node scripts/check-conventions.mjs:*), Read, Grep, Glob
---

## 改動範圍

!`BASE=$1; BASE=${BASE:-origin/main}; git --no-pager diff --stat "$(git merge-base "$BASE" HEAD)"...HEAD -- . ':(exclude)pnpm-lock.yaml'`

## 確定性檢查的結果

!`node scripts/check-conventions.mjs $1 2>&1 | tail -20`

## 完整 diff

!`BASE=$1; BASE=${BASE:-origin/main}; git --no-pager diff "$(git merge-base "$BASE" HEAD)"...HEAD -- . ':(exclude)pnpm-lock.yaml'`

## 任務

審查準則見 @.github/AI_REVIEW.md，請完整讀過再開始，特別是「不要報什麼」那一節 ——
它的優先級高於你自己的判斷。

1. 只 review 上面 diff 裡的改動。需要上下文時去讀相關檔案，但不要 review 沒改到的程式碼。
2. 上面「確定性檢查的結果」已經報掉的項目不要重複講。
3. 按嚴重度排序輸出，每條都要有 `file:line`、問題、後果、建議四項。
4. 沒有 Blocker 也沒有 Major 就直說，並列出你檢查過的面向。
5. **不要修改任何檔案。** 這是 review 不是 fix；要修的話我會另外叫你。
