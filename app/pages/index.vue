<script setup lang="ts">
/**
 * 首頁 —— **這是給你替換的佔位頁面**。
 *
 * 樣板本身的示範內容全部放在 `app/pages/demo/` 底下，那一區在 production
 * 建置時會被整個移除（見 `nuxt.config.ts` 的 `pages:extend`），
 * 所以這裡刻意保持乾淨：真實專案的首頁從這個檔案開始寫。
 */
const { t } = useI18n()
const config = useRuntimeConfig()

useHead({ title: t('home.title') })
</script>

<template>
  <div class="flex flex-col items-center gap-6 py-12 text-center">
    <h1 class="text-fluid-2xl font-bold tracking-tight">
      {{ config.public.appName }}
    </h1>

    <p class="max-w-xl text-fluid-base text-content-muted">
      {{ t('home.placeholder') }}
    </p>

    <!--
      demo 入口只在 demo 啟用時（也就是開發環境）顯示。
      production 建置下 /demo 路由根本不存在，這個連結也不會被渲染。
    -->
    <UiBaseButton v-if="config.public.demoEnabled" size="lg" @click="navigateTo('/demo')">
      {{ t('home.viewDemo') }}
    </UiBaseButton>
  </div>
</template>
