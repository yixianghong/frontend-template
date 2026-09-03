<script setup lang="ts">
/**
 * 預設版面 —— 同時是 RWD 的實作範例。
 *
 * ## 這裡示範的 RWD 手法
 * 1. **Mobile-first**：先寫手機樣式，再用 `md:` / `lg:` 往上加。
 *    反過來寫（先桌機再用 max-width 覆寫）會讓 class 又長又難維護。
 * 2. **漢堡選單**：`md` 以下收合，以上展開為水平選單。
 * 3. **觸控目標尺寸**：所有可點擊元素至少 44×44px（`min-h-11`），
 *    這是 WCAG 與各家行動平台的建議下限，太小的按鈕在手機上很難點中。
 * 4. **JS 端斷點判斷**：用 VueUse 的 `useBreakpoints`，可以在 script 裡
 *    依螢幕尺寸改變行為（不只是樣式）。
 */
const { isLoggedIn, displayName, logout } = useAuth()
const { isDark, toggle: toggleTheme } = useTheme()
const { locale, locales, setLocale, t } = useI18n()

const mobileMenuOpen = ref(false)

// VueUse 的斷點工具。這裡的值必須與 main.css 的 @theme 斷點保持一致。
const breakpoints = useBreakpoints({ xs: 480, sm: 640, md: 768, lg: 1024, xl: 1280 })
const isDesktop = breakpoints.greaterOrEqual('md')

// 切換到桌機寬度時自動收起手機選單，避免狀態殘留造成版面錯亂
watch(isDesktop, (desktop) => {
  if (desktop) mobileMenuOpen.value = false
})

// 路由切換後關閉選單
const route = useRoute()
watch(
  () => route.fullPath,
  () => (mobileMenuOpen.value = false),
)

const config = useRuntimeConfig()

const navLinks = computed(() => [
  { to: '/', label: t('nav.home') },
  // demo 區只在開發環境存在（production 建置時路由已被移除），
  // 所以連結也只在那時顯示，避免產生指向 404 的死連結
  ...(config.public.demoEnabled ? [{ to: '/demo', label: t('nav.demo') }] : []),
])

const availableLocales = computed(() => locales.value.filter((l) => l.code !== locale.value))
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface text-content">
    <!-- 跳過導覽：鍵盤使用者按第一次 Tab 就能直接跳到主內容 -->
    <a
      href="#main"
      class="sr-only-focusable absolute left-4 top-4 z-50 rounded bg-brand-600 px-4 py-2 text-white"
    >
      跳至主要內容
    </a>

    <header class="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div class="container-content flex min-h-16 items-center justify-between gap-4">
        <NuxtLink :to="'/'" class="text-fluid-lg font-bold text-brand-600">
          {{ $config.public.appName }}
        </NuxtLink>

        <!-- 桌機：水平選單（md 以上才顯示） -->
        <nav class="hidden items-center gap-1 md:flex" :aria-label="t('nav.primary')">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="min-h-11 rounded-lg px-3 py-2 text-fluid-sm font-medium text-content-muted transition hover:bg-surface-muted hover:text-content"
            active-class="text-brand-600"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2">
          <!-- 語系切換 -->
          <button
            v-for="loc in availableLocales"
            :key="loc.code"
            type="button"
            class="min-h-11 rounded-lg px-3 text-fluid-sm text-content-muted transition hover:bg-surface-muted"
            @click="setLocale(loc.code)"
          >
            {{ loc.name }}
          </button>

          <!-- 深色模式切換 -->
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-lg transition hover:bg-surface-muted"
            :aria-label="isDark ? t('theme.toLight') : t('theme.toDark')"
            @click="toggleTheme"
          >
            {{ isDark ? '🌙' : '☀️' }}
          </button>

          <!-- 登入狀態（桌機才顯示文字，手機收進選單） -->
          <div class="hidden items-center gap-2 md:flex">
            <template v-if="isLoggedIn">
              <span class="text-fluid-sm text-content-muted">{{ displayName }}</span>
              <button
                type="button"
                class="min-h-11 rounded-lg border border-border px-4 text-fluid-sm transition hover:bg-surface-muted"
                @click="logout()"
              >
                {{ t('auth.logout') }}
              </button>
            </template>
            <NuxtLink
              v-else
              :to="config.public.loginPath"
              class="flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-fluid-sm font-medium text-white transition hover:bg-brand-700"
            >
              {{ t('auth.login') }}
            </NuxtLink>
          </div>

          <!-- 手機：漢堡按鈕（md 以上隱藏） -->
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-lg transition hover:bg-surface-muted md:hidden"
            :aria-expanded="mobileMenuOpen"
            aria-controls="mobile-menu"
            :aria-label="t('nav.toggleMenu')"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <span class="text-xl">{{ mobileMenuOpen ? '✕' : '☰' }}</span>
          </button>
        </div>
      </div>

      <!-- 手機選單 -->
      <nav
        v-show="mobileMenuOpen"
        id="mobile-menu"
        class="border-t border-border md:hidden"
        :aria-label="t('nav.mobile')"
      >
        <div class="container-content flex flex-col gap-1 py-3">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="flex min-h-11 items-center rounded-lg px-3 text-fluid-sm font-medium transition hover:bg-surface-muted"
            active-class="text-brand-600"
          >
            {{ link.label }}
          </NuxtLink>

          <hr class="my-2 border-border" />

          <template v-if="isLoggedIn">
            <span class="px-3 py-2 text-fluid-sm text-content-muted">{{ displayName }}</span>
            <button
              type="button"
              class="flex min-h-11 items-center rounded-lg px-3 text-left text-fluid-sm transition hover:bg-surface-muted"
              @click="logout()"
            >
              {{ t('auth.logout') }}
            </button>
          </template>
          <NuxtLink
            v-else
            :to="config.public.loginPath"
            class="flex min-h-11 items-center rounded-lg bg-brand-600 px-3 text-fluid-sm font-medium text-white"
          >
            {{ t('auth.login') }}
          </NuxtLink>
        </div>
      </nav>
    </header>

    <main id="main" class="container-content flex-1 py-8 md:py-12">
      <slot />
    </main>

    <footer class="border-t border-border py-6">
      <div class="container-content text-center text-fluid-sm text-content-muted">
        © {{ new Date().getFullYear() }} {{ $config.public.appName }}
      </div>
    </footer>
  </div>
</template>
