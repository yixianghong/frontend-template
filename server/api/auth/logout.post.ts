import { defineApiHandler } from '../../utils/handler'
import { clearUserSession, getSessionUser } from '../../utils/session'

/**
 * 登出：清除 session 與 CSRF cookie。
 *
 * ## 為什麼是 POST 而不是 GET
 * 登出會改變伺服器狀態，依 HTTP 語義必須用非安全方法。更實際的理由是：
 * 如果登出是 GET，攻擊者只要在論壇貼一張
 * `<img src="https://yoursite.com/api/auth/logout">`，
 * 所有瀏覽到該頁的使用者都會被登出。用 POST 才能受 CSRF 防護。
 *
 * ## 沒登入也回成功
 * 重複登出、或 session 已過期時仍回 200。登出是**冪等**操作，
 * 「達成未登入狀態」這個目標已經滿足了，回錯誤只會讓前端多寫處理邏輯。
 */
export default defineApiHandler(async (event) => {
  const user = await getSessionUser(event)
  await clearUserSession(event)

  if (user) {
    event.context.logger.info({ userId: user.id }, 'user logged out')
  }

  return { loggedOut: true }
})
