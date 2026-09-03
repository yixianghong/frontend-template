<script setup lang="ts">
/**
 * 基礎按鈕。
 *
 * 元件放在 `app/components/ui/` 底下，Nuxt 會自動註冊為 `<UiBaseButton>`
 * （目錄名 + 檔名），不需要 import。
 *
 * ## 設計重點
 * - 最小高度 44px（`min-h-11`）符合觸控目標的無障礙建議
 * - `loading` 時自動 disabled，避免重複送出
 * - 顏色一律用語意化 token（`bg-brand-600`），換品牌色不用改元件
 */
withDefaults(
  defineProps<{
    /** 視覺樣式。 */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    /** 尺寸。 */
    size?: 'sm' | 'md' | 'lg'
    /** 載入中：顯示轉圈並停用按鈕。 */
    loading?: boolean
    disabled?: boolean
    /** 原生 type。表單內的按鈕預設是 submit，這裡改成 button 比較安全。 */
    type?: 'button' | 'submit' | 'reset'
    /** 手機版是否撐滿寬度 —— 行動裝置上大按鈕比較好點。 */
    blockOnMobile?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    type: 'button',
    blockOnMobile: false,
  },
)

const variantClasses: Record<string, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'border border-border bg-surface text-content hover:bg-surface-muted',
  ghost: 'text-content-muted hover:bg-surface-muted hover:text-content',
  danger: 'bg-danger text-white hover:opacity-90',
}

const sizeClasses: Record<string, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-5 text-fluid-sm',
  lg: 'min-h-12 px-7 text-fluid-base',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    :class="[variantClasses[variant], sizeClasses[size], blockOnMobile ? 'w-full sm:w-auto' : '']"
  >
    <span
      v-if="loading"
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
