import type { LoginInput, PublicUser } from '#shared/schemas/auth'
import { useUserStore } from '~/stores/user'
import { ApiError } from '~/utils/api-error'

/**
 * 端點路徑集中定義 —— 與 `useDemoApi.ts` 同一個慣例。
 * 這是本檔案唯一出現路徑字串的地方，頁面裡不會再看到 `/auth/*`。
 */
const ENDPOINTS = {
  me: '/auth/me',
  login: '/auth/login',
  logout: '/auth/logout',
} as const

/**
 * 認證狀態與操作。
 *
 * ## 登入狀態是怎麼在 SSR 下運作的
 * ```
 * 1. 瀏覽器請求頁面，自動帶上 httpOnly session cookie
 * 2. SSR 期間 initAuth() 執行 → useApiClient 把 cookie 轉發給 BFF
 * 3. BFF 解密 session，回傳使用者資料
 * 4. 資料存進 Pinia store → 隨 SSR payload 送到瀏覽器
 * 5. 瀏覽器 hydration 時直接還原，**不會再打一次 API，也不會畫面閃動**
 * ```
 *
 * 第 2 步是關鍵，也是最容易做錯的地方 —— 細節見 `useApiClient.ts` 的說明。
 *
 * ## 前端拿不到 token，這是正常的
 * 這個 composable 沒有 `token` 或 `accessToken`，因為 token 從頭到尾都待在
 * BFF 的加密 session 裡。前端只需要知道「有沒有登入」與「使用者是誰」，
 * 呼叫 API 時 cookie 會自動帶上，不需要手動組 Authorization header。
 *
 * @example 在元件中使用
 * ```vue
 * <script setup lang="ts">
 * const { user, isLoggedIn, logout } = useAuth()
 * </script>
 *
 * <template>
 *   <div v-if="isLoggedIn">
 *     你好，{{ user?.name }}
 *     <button @click="logout()">登出</button>
 *   </div>
 *   <NuxtLink v-else :to="$config.public.loginPath">登入</NuxtLink>
 * </template>
 * ```
 *
 * @example 登入表單
 * ```ts
 * const { login } = useAuth()
 * const { attempt } = useApi()
 *
 * const { error } = await attempt(() => login({ email, password }))
 * if (error) return (message.value = error.message)
 * await navigateTo('/')
 * ```
 */
export function useAuth() {
  const store = useUserStore()
  const { public: publicConfig } = useRuntimeConfig()

  // 使用者主動觸發的操作（登入、登出）走 useApi()，
  // 這樣 loading 與 error 狀態可以直接交給頁面用，頁面不必自己管。
  const { post, loading, error } = useApi()

  // initAuth 是「背景靜默還原」，刻意不走 useApi() ——
  // 未登入時的 401 是完全正常的狀態，不該把 error 狀態染紅、
  // 讓每個匿名訪客的畫面都出現錯誤提示。
  const client = useApiClient()

  /**
   * 從 session 還原登入狀態。
   *
   * 已在 `app/app.vue` 中被呼叫，一般不需要自己呼叫。
   * 使用 `callOnce` 確保 SSR 與 client 加起來只會執行一次。
   */
  async function initAuth(): Promise<void> {
    if (store.initialized) return

    await callOnce('auth:init', async () => {
      try {
        const response = await client<{ data: PublicUser }>(ENDPOINTS.me)
        store.setUser(response.data)
      } catch (err) {
        // 401 = 沒登入，這是完全正常的狀態，不是錯誤
        const apiError = ApiError.from(err)
        if (!apiError.isAuthError) {
          console.error('[auth] 還原登入狀態失敗', apiError.message)
        }
        store.setUser(null)
      }
    })
  }

  /**
   * 登入。成功後 store 會更新，且瀏覽器會收到 httpOnly session cookie。
   *
   * @throws {ApiError} 帳密錯誤時為 `UNAUTHORIZED`，欄位格式錯誤時為 `VALIDATION_ERROR`
   */
  async function login(credentials: LoginInput): Promise<PublicUser> {
    // useApi() 的 post 回傳的已經是拆封後的 data，不需要再讀 .data
    const user = await post<PublicUser>(ENDPOINTS.login, credentials)
    store.setUser(user)
    return user
  }

  /**
   * 登出並導向指定頁面。
   *
   * 即使 API 呼叫失敗（例如網路斷線）也會清除前端狀態 ——
   * 使用者按了登出就該登出，不能因為網路問題把他卡在已登入畫面。
   */
  async function logout(redirectTo?: string): Promise<void> {
    // 未指定時使用 runtimeConfig 的 loginPath（見 nuxt.config.ts）
    const target = redirectTo ?? publicConfig.loginPath

    try {
      await post(ENDPOINTS.logout)
    } catch (err) {
      console.error('[auth] 登出請求失敗，仍清除本地狀態', ApiError.from(err).message)
    } finally {
      store.reset()
      // 重新整理路由資料，確保受保護頁面的資料被清掉
      await navigateTo(target)
    }
  }

  return {
    /** 是否有登入／登出請求進行中。頁面可直接綁到按鈕的 loading 狀態。 */
    loading,
    /** 最近一次登入／登出失敗的錯誤（`ApiError`）。每次新請求開始時會清空。 */
    error,
    /** 目前登入的使用者，未登入為 `null`。 */
    user: computed(() => store.user),
    /** 是否已登入。 */
    isLoggedIn: computed(() => store.isLoggedIn),
    /** 顯示名稱，未登入時為「訪客」。 */
    displayName: computed(() => store.displayName),
    /** 檢查角色權限。 */
    hasRole: store.hasRole,
    initAuth,
    login,
    logout,
  }
}
