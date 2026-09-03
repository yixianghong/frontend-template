<script setup lang="ts">
/**
 * 應用程式根元件。
 *
 * 這裡只做三件全域的事，畫面結構交給 `layouts/`：
 * 1. 還原登入狀態（SSR 期間就完成，避免畫面閃動）
 * 2. 套用深色模式（同樣在 SSR 期間就決定）
 * 3. 設定全站預設的 SEO meta
 */
const { initAuth } = useAuth()
useTheme()

// 在 SSR 期間就還原登入狀態，讓伺服器渲染出來的 HTML 已經是正確的登入畫面。
// callOnce 確保 SSR 與 client 加起來只執行一次。
await initAuth()

const config = useRuntimeConfig()
const { t } = useI18n()

useHead({
  titleTemplate: (title) => (title ? `${title} | ${config.public.appName}` : config.public.appName),
  meta: [{ name: 'description', content: () => t('meta.description') }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
