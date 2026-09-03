<script setup lang="ts">
/**
 * 樣板示範總覽。
 *
 * ⚠️ 這整個 `app/pages/demo/` 目錄只在開發環境存在 ——
 * production 建置時會被 `nuxt.config.ts` 的 `pages:extend` 整個移除，
 * 程式碼不會進到 bundle。
 *
 * 開新專案時可以直接刪掉整個目錄，刪除清單見 README。
 */
const { t } = useI18n()
useHead({ title: t('demo.overview.title') })

const features = computed(() => [
  {
    icon: '🛡️',
    title: t('demo.overview.features.security.title'),
    body: t('demo.overview.features.security.body'),
  },
  {
    icon: '📋',
    title: t('demo.overview.features.logging.title'),
    body: t('demo.overview.features.logging.body'),
  },
  {
    icon: '📦',
    title: t('demo.overview.features.format.title'),
    body: t('demo.overview.features.format.body'),
  },
  {
    icon: '🔌',
    title: t('demo.overview.features.bff.title'),
    body: t('demo.overview.features.bff.body'),
  },
  {
    icon: '🧪',
    title: t('demo.overview.features.testing.title'),
    body: t('demo.overview.features.testing.body'),
  },
  {
    icon: '📱',
    title: t('demo.overview.features.rwd.title'),
    body: t('demo.overview.features.rwd.body'),
  },
])

const demoLinks = computed(() => [
  {
    to: '/demo/api',
    title: t('demo.overview.links.api.title'),
    body: t('demo.overview.links.api.body'),
  },
  {
    to: '/demo/login',
    title: t('demo.overview.links.login.title'),
    body: t('demo.overview.links.login.body'),
  },
])
</script>

<template>
  <div class="flex flex-col gap-12">
    <section class="text-center">
      <p class="inline-block rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
        {{ t('demo.overview.devOnly') }}
      </p>

      <h1 class="mt-4 text-fluid-3xl font-bold tracking-tight">
        {{ t('demo.overview.heading') }}
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-fluid-base text-content-muted">
        {{ t('demo.overview.subheading') }}
      </p>
    </section>

    <!-- 各示範頁的入口 -->
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NuxtLink v-for="link in demoLinks" :key="link.to" :to="link.to" class="group">
        <UiBaseCard>
          <h2 class="text-fluid-lg font-semibold group-hover:text-brand-600">{{ link.title }} →</h2>
          <p class="mt-1 text-fluid-sm text-content-muted">{{ link.body }}</p>
        </UiBaseCard>
      </NuxtLink>
    </section>

    <!--
      RWD 網格：手機 1 欄 → sm 2 欄 → lg 3 欄。
      這是 mobile-first 的寫法：基礎樣式給最小螢幕，往上逐級加。
    -->
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiBaseCard v-for="feature in features" :key="feature.title">
        <div class="flex flex-col gap-2">
          <span class="text-2xl" aria-hidden="true">{{ feature.icon }}</span>
          <h2 class="text-fluid-lg font-semibold">{{ feature.title }}</h2>
          <p class="text-fluid-sm text-content-muted">{{ feature.body }}</p>
        </div>
      </UiBaseCard>
    </section>
  </div>
</template>
