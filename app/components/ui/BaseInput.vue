<script setup lang="ts">
/**
 * 基礎輸入框，內建錯誤訊息與無障礙屬性串接。
 *
 * ## 與 BFF 錯誤格式的整合
 * `error` 直接傳 `ApiError.fieldErrors[欄位名]?.[0]` 即可：
 * ```vue
 * <UiBaseInput v-model="form.email" label="Email" :error="error?.fieldErrors.email?.[0]" />
 * ```
 *
 * ## 無障礙處理
 * - `label` 與 input 用 `for`/`id` 正確關聯
 * - 錯誤訊息用 `aria-describedby` 綁定，螢幕閱讀器會一起讀出來
 * - `aria-invalid` 讓輔助科技知道這個欄位有問題
 * - `font-size` 至少 16px，否則 iOS Safari 聚焦時會自動放大整個頁面
 */
const props = withDefaults(
  defineProps<{
    label: string
    type?: string
    error?: string
    hint?: string
    required?: boolean
    autocomplete?: string
    placeholder?: string
  }>(),
  { type: 'text', required: false },
)

const model = defineModel<string>({ required: true })

const id = useId()
const errorId = computed(() => `${id}-error`)
const hintId = computed(() => `${id}-hint`)

const describedBy = computed(() => {
  const ids = []
  if (props.hint) ids.push(hintId.value)
  if (props.error) ids.push(errorId.value)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-fluid-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>

    <input
      :id="id"
      v-model="model"
      :type="type"
      :required="required"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :aria-invalid="Boolean(error)"
      :aria-describedby="describedBy"
      class="min-h-11 rounded-lg border bg-surface px-3 text-base transition placeholder:text-content-muted"
      :class="error ? 'border-danger' : 'border-border focus:border-brand-500'"
    />

    <p v-if="hint && !error" :id="hintId" class="text-xs text-content-muted">
      {{ hint }}
    </p>

    <p v-if="error" :id="errorId" class="text-xs text-danger" role="alert">
      {{ error }}
    </p>
  </div>
</template>
