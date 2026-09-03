<script setup lang="ts">
/**
 * 登入頁。
 *
 * 這一頁**沒有任何 API 端點路徑，也沒有直接使用 `useApi`** ——
 * 認證相關的一切都由 `useAuth()` 提供（見 `app/composables/api/useAuth.ts`）。
 * 頁面只負責畫面與流程：收表單、送出、依結果導向。
 *
 * `loading` 與 `error` 也由 composable 管理，頁面不必自己維護這兩個狀態。
 */
const { t } = useI18n()
const route = useRoute()
const { login, isLoggedIn, loading, error } = useAuth()

useHead({ title: t('auth.login') })

const form = reactive({ email: '', password: '' })

const redirectTarget = computed(() => (route.query.redirect as string) || '/')

// 已登入就不該停留在登入頁
watchEffect(() => {
  if (isLoggedIn.value) navigateTo(redirectTarget.value)
})

async function onSubmit() {
  try {
    await login({ email: form.email, password: form.password })
    await navigateTo(redirectTarget.value)
  } catch {
    // error ref 已由 useAuth 自動填上，模板會顯示它
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <UiBaseCard :title="t('auth.login')">
      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <UiBaseInput
          v-model="form.email"
          :label="t('auth.email')"
          type="email"
          autocomplete="email"
          required
          placeholder="you@example.com"
          :error="error?.fieldErrors.email?.[0]"
        />

        <UiBaseInput
          v-model="form.password"
          :label="t('auth.password')"
          type="password"
          autocomplete="current-password"
          required
          :hint="t('auth.passwordHint')"
          :error="error?.fieldErrors.password?.[0]"
        />

        <!-- 非欄位層級的錯誤（例如帳密錯誤）顯示在這裡 -->
        <p
          v-if="error && Object.keys(error.fieldErrors).length === 0"
          class="rounded-lg bg-danger/10 px-3 py-2 text-fluid-sm text-danger"
          role="alert"
        >
          {{ error.message }}
        </p>

        <UiBaseButton type="submit" :loading="loading" size="lg">
          {{ t('auth.login') }}
        </UiBaseButton>
      </form>

      <template #footer>
        <p class="text-xs text-content-muted">
          {{ t('auth.demoHint') }}
        </p>
      </template>
    </UiBaseCard>
  </div>
</template>
