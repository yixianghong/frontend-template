<script setup lang="ts">
import type { DemoItem } from '#shared/schemas/demo'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 兩種 API 呼叫方式的對照示範 —— 這一頁就是活的使用說明文件
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ## 分層
 * ```
 * 頁面（這裡）
 *   └─ 領域 composable   useDemoItems / useDemoActions   ← 端點與型別集中在這層
 *        └─ 通用封裝      useApiFetch / useApi
 *             └─ 底層     useApiClient（SSR cookie 轉發、CSRF、錯誤正規化）
 *                  └─ BFF /api/demo/*
 * ```
 *
 * **頁面裡不會出現任何端點路徑字串** —— 那些都在
 * `app/composables/api/useDemoApi.ts`。後端改路徑時只要改那一個檔案。
 *
 * ## 兩種呼叫方式怎麼選
 *
 *   資料是「畫面的一部分」 → 宣告式（`useDemoItems`，底層是 `useApiFetch`）
 *   資料是「動作的結果」   → 命令式（`useDemoActions`，底層是 `useApi`）
 *
 * 這一頁兩種都用到了：列表用宣告式（進頁面就要有、要 SSR），
 * 下面的按鈕用命令式（使用者點了才發生）。
 */

const { t } = useI18n()
useHead({ title: t('demo.title') })

/* ───────────────────────────────────────────────────────────────────────
 * 宣告式：進頁面就自動載入，SSR 期間在伺服器端取好寫進 payload，
 * 瀏覽器 hydration 時直接用，不會再打第二次。
 *
 * `page` 傳的是 ref，值改變時會自動重新載入 —— 不需要自己寫 watch。
 * ─────────────────────────────────────────────────────────────────────── */
const page = ref(1)

const { data: items, pagination, pending, error, refresh } = useDemoItems({ page, pageSize: 6 })

/* ───────────────────────────────────────────────────────────────────────
 * 命令式：使用者操作才觸發。
 *
 * 注意這些是在事件處理函式裡呼叫的，不是在 setup 頂層 ——
 * 在頂層呼叫會導致 SSR 與 hydration 各抓一次。
 * ─────────────────────────────────────────────────────────────────────── */
const { fetchItem, loading: peeking, error: peekError } = useDemoActions()
const peekedItem = ref<DemoItem | null>(null)

async function peekFirstItem() {
  peekedItem.value = null
  const target = items.value?.[0]
  if (!target) return

  // 直接 await 拿到已拆封的資料，失敗會拋出 ApiError
  peekedItem.value = await fetchItem(target.id)
}

/** 示範錯誤流程：查一個一定不存在的 ID，看統一錯誤格式怎麼呈現。 */
async function triggerNotFound() {
  peekedItem.value = null
  try {
    await fetchItem('does-not-exist')
  } catch {
    // peekError ref 已經被自動填上，模板會顯示它
  }
}

const canGoNext = computed(() => pagination.value?.hasNext ?? false)
const canGoPrev = computed(() => page.value > 1)
</script>

<template>
  <div class="flex flex-col gap-8">
    <header>
      <h1 class="text-fluid-2xl font-bold">{{ t('demo.title') }}</h1>
      <p class="mt-2 text-fluid-sm text-content-muted">{{ t('demo.description') }}</p>
    </header>

    <!-- ═══ 方式 A 的區塊 ═══ -->
    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-fluid-lg font-semibold">
          {{ t('demo.methodA') }}
          <code class="ml-2 rounded bg-surface-muted px-2 py-0.5 font-mono text-xs"
            >useDemoItems()</code
          >
        </h2>
        <UiBaseButton variant="secondary" size="sm" :loading="pending" @click="refresh()">
          {{ t('demo.refresh') }}
        </UiBaseButton>
      </div>

      <!-- 載入中骨架：保留與實際內容相同的高度，避免版面跳動（CLS） -->
      <div v-if="pending && !items" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="h-32 animate-pulse rounded-xl bg-surface-muted" />
      </div>

      <p
        v-else-if="error"
        class="rounded-lg bg-danger/10 px-4 py-3 text-fluid-sm text-danger"
        role="alert"
      >
        {{ error.message }}
        <span class="ml-2 font-mono text-xs opacity-70">({{ error.code }})</span>
      </p>

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UiBaseCard v-for="item in items" :key="item.id">
          <h3 class="font-semibold">{{ item.title }}</h3>
          <p class="mt-1 text-fluid-sm text-content-muted">{{ item.description }}</p>
          <NuxtLink
            :to="`/demo/api/${item.id}`"
            class="mt-3 inline-block text-fluid-sm text-brand-600 hover:underline"
          >
            {{ t('demo.viewDetail') }} →
          </NuxtLink>
        </UiBaseCard>
      </div>

      <!-- 分頁資訊來自統一回應格式的 meta.pagination -->
      <div v-if="pagination" class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-fluid-sm text-content-muted">
          {{
            t('demo.pageInfo', {
              page: pagination.page,
              total: pagination.totalPages,
              count: pagination.total,
            })
          }}
        </p>
        <div class="flex gap-2">
          <UiBaseButton variant="secondary" size="sm" :disabled="!canGoPrev" @click="page--">
            {{ t('demo.prev') }}
          </UiBaseButton>
          <UiBaseButton variant="secondary" size="sm" :disabled="!canGoNext" @click="page++">
            {{ t('demo.next') }}
          </UiBaseButton>
        </div>
      </div>
    </section>

    <hr class="border-border" />

    <!-- ═══ 方式 B 的區塊 ═══ -->
    <section class="flex flex-col gap-4">
      <h2 class="text-fluid-lg font-semibold">
        {{ t('demo.methodB') }}
        <code class="ml-2 rounded bg-surface-muted px-2 py-0.5 font-mono text-xs"
          >useDemoActions()</code
        >
      </h2>
      <p class="text-fluid-sm text-content-muted">{{ t('demo.methodBDescription') }}</p>

      <div class="flex flex-wrap gap-3">
        <UiBaseButton :loading="peeking" @click="peekFirstItem">
          {{ t('demo.peek') }}
        </UiBaseButton>
        <UiBaseButton variant="danger" :loading="peeking" @click="triggerNotFound">
          {{ t('demo.triggerError') }}
        </UiBaseButton>
      </div>

      <UiBaseCard v-if="peekedItem" :title="peekedItem.title">
        <p class="text-fluid-sm text-content-muted">{{ peekedItem.description }}</p>
      </UiBaseCard>

      <!-- 錯誤時顯示完整的統一錯誤格式，方便理解 BFF 回了什麼 -->
      <div v-if="peekError" class="rounded-lg bg-danger/10 px-4 py-3" role="alert">
        <p class="text-fluid-sm font-medium text-danger">{{ peekError.message }}</p>
        <dl
          class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-content-muted"
        >
          <dt>code</dt>
          <dd>{{ peekError.code }}</dd>
          <dt>status</dt>
          <dd>{{ peekError.statusCode }}</dd>
          <dt>requestId</dt>
          <dd class="break-all">{{ peekError.requestId }}</dd>
        </dl>
      </div>
    </section>
  </div>
</template>
