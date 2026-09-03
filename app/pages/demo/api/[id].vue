<script setup lang="ts">
/**
 * 詳情頁 —— 示範動態路由 + SSR + 404 處理。
 *
 * 端點路徑與回傳型別都收在 `useDemoItem()` 裡（見
 * `app/composables/api/useDemoApi.ts`），這一頁只表達「我要這個 id 的資料」。
 *
 * id 傳 getter 函式（`() => ...`）而不是字串，路由參數改變時才會自動重抓。
 */
const route = useRoute()
const { t } = useI18n()

const { data: item, error, pending } = await useDemoItem(() => String(route.params.id))

// 找不到資料時丟出 404，交給 app/error.vue 渲染錯誤頁。
// 在 setup 中同步呼叫 showError，SSR 會直接回傳 404 狀態碼（對 SEO 很重要）。
if (error.value?.code === 'NOT_FOUND') {
  showError({
    statusCode: 404,
    statusMessage: '找不到這筆資料',
    data: { requestId: error.value.requestId },
  })
}

useHead({ title: computed(() => item.value?.title ?? t('demo.detail')) })
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6">
    <NuxtLink to="/demo/api" class="text-fluid-sm text-brand-600 hover:underline">
      ← {{ t('demo.backToList') }}
    </NuxtLink>

    <div v-if="pending" class="h-40 animate-pulse rounded-xl bg-surface-muted" />

    <UiBaseCard v-else-if="item" :title="item.title">
      <p class="text-fluid-base text-content-muted">{{ item.description }}</p>

      <template #footer>
        <p class="text-xs text-content-muted">
          {{ t('demo.createdAt') }}：
          <time :datetime="item.createdAt">{{
            new Date(item.createdAt).toLocaleDateString()
          }}</time>
        </p>
      </template>
    </UiBaseCard>

    <p
      v-else-if="error"
      class="rounded-lg bg-danger/10 px-4 py-3 text-fluid-sm text-danger"
      role="alert"
    >
      {{ error.message }}
    </p>
  </div>
</template>
