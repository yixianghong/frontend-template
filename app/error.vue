<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * 全域錯誤頁。
 *
 * Nuxt 在 SSR 或路由過程中遇到未處理的錯誤時會渲染這個元件，
 * 取代整個頁面（注意：這時 `layouts/` 不會被套用，所以版面要自己畫）。
 *
 * ## 設計重點
 * - **顯示 requestId**：使用者回報問題時提供這串 ID，就能直接對應到 server log
 * - **不顯示 stack trace**：正式環境的堆疊資訊可能洩漏內部結構
 * - **提供出口**：至少要有一個「回首頁」，不能讓使用者卡在死路
 */
const props = defineProps<{ error: NuxtError }>()

const requestId = computed(() => {
  const data = props.error.data
  if (data && typeof data === 'object' && 'requestId' in data) return String(data.requestId)
  return null
})

const isNotFound = computed(() => props.error.statusCode === 404)

const title = computed(() => (isNotFound.value ? '找不到頁面' : '發生錯誤'))

const description = computed(() =>
  isNotFound.value
    ? '你要找的頁面不存在，可能已被移除或網址輸入有誤。'
    : '系統暫時無法處理這個請求，請稍後再試一次。',
)

useHead({ title: title.value })

function goHome() {
  // clearError 會清掉錯誤狀態並導向指定頁面
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface px-4 py-16 text-content">
    <div class="w-full max-w-md text-center">
      <p class="text-fluid-3xl font-bold text-brand-500">
        {{ error.statusCode }}
      </p>

      <h1 class="mt-4 text-fluid-xl font-semibold">{{ title }}</h1>

      <p class="mt-3 text-fluid-sm text-content-muted">{{ description }}</p>

      <button
        type="button"
        class="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-6 font-medium text-white transition hover:bg-brand-700"
        @click="goHome"
      >
        回到首頁
      </button>

      <!-- 追蹤 ID：請使用者回報問題時附上這串，可直接在 log 中定位 -->
      <p v-if="requestId" class="mt-6 font-mono text-xs text-content-muted">
        追蹤編號：{{ requestId }}
      </p>
    </div>
  </div>
</template>
