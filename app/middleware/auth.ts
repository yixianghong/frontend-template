/**
 * 路由守衛：要求登入。
 *
 * ## 使用方式
 * 在需要保護的頁面加上：
 * ```vue
 * <script setup lang="ts">
 * definePageMeta({ middleware: 'auth' })
 * </script>
 * ```
 *
 * ## SSR 下為什麼可以直接讀 store
 * 登入狀態在 `app.vue` 的 `initAuth()` 就已經還原完成（SSR 期間就做完了），
 * 所以這裡讀 Pinia store 是同步且正確的，不需要再打一次 API。
 *
 * ## ⚠️ 這只是使用者體驗，不是安全機制
 * 路由守衛跑在**用戶端可控的環境**中，攻擊者可以繞過它。
 * 真正的權限檢查必須在 BFF 做（`requireUser()` / `requireRole()`），
 * 這裡只是避免使用者看到一個註定會失敗的空白頁面。
 */
export default defineNuxtRouteMiddleware((to) => {
  const { isLoggedIn } = useAuth()

  if (isLoggedIn.value) return

  // 登入頁路徑由 runtimeConfig 集中管理（`public.loginPath`），
  // 各專案建立自己的登入頁後改設定即可，不需要動這個檔案。
  const { public: publicConfig } = useRuntimeConfig()

  // 記下原本要去的頁面，登入成功後導回去
  return navigateTo({
    path: publicConfig.loginPath,
    query: { redirect: to.fullPath },
  })
})
