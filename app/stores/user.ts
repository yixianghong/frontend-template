import { defineStore } from 'pinia'
import type { PublicUser } from '#shared/schemas/auth'

/**
 * 使用者狀態 —— 同時也是「SSR-safe Pinia store」的示範。
 *
 * ## SSR 下使用 Pinia 要注意的三件事
 *
 * ### 1. 絕對不要在模組頂層建立狀態
 * ```ts
 * // ❌ 這個物件會被同一個 Node 程序的**所有使用者**共用 —— 嚴重的資料外洩
 * const sharedCache = { user: null }
 * export const useUserStore = defineStore('user', () => ({ user: sharedCache }))
 * ```
 * `defineStore` 的 setup 函式**每個請求都會重新執行**，所有狀態都必須在
 * 函式**內部**用 `ref()` 建立，這樣每個請求才有自己的一份。
 *
 * ### 2. 狀態會自動序列化到前端
 * `@pinia/nuxt` 會把 server 端的 store 狀態寫進 SSR payload，
 * 瀏覽器 hydration 時直接還原。所以**不要把敏感資料放進 store** ——
 * 它會出現在 HTML 原始碼裡。這也是為什麼這裡只放 `PublicUser` 而不放 token。
 *
 * ### 3. 不要在 store 裡呼叫需要 request context 的 composable
 * `useCookie` / `useRequestHeaders` 這類需要當前請求上下文的 composable，
 * 應該在元件或 composable 中呼叫後把值傳進來，而不是在 action 裡直接用。
 * 本 store 透過 `useApiClient()`（在 action 內同步呼叫，仍在請求上下文中）是安全的。
 */
export const useUserStore = defineStore('user', () => {
  // ✅ 所有狀態都在 setup 函式內建立 —— 每個 SSR 請求各自獨立
  const user = ref<PublicUser | null>(null)

  /** 是否已嘗試過還原登入狀態。避免每次路由切換都重打 /api/auth/me。 */
  const initialized = ref(false)

  const isLoggedIn = computed(() => user.value !== null)

  const displayName = computed(() => user.value?.name ?? '訪客')

  /** 判斷是否具備某個角色。 */
  function hasRole(role: string): boolean {
    return user.value?.roles.includes(role) ?? false
  }

  function setUser(next: PublicUser | null): void {
    user.value = next
    initialized.value = true
  }

  function reset(): void {
    user.value = null
    initialized.value = false
  }

  return { user, initialized, isLoggedIn, displayName, hasRole, setUser, reset }
})
