// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BaseButton from '../../app/components/ui/BaseButton.vue'
import BaseInput from '../../app/components/ui/BaseInput.vue'

describe('UiBaseButton', () => {
  it('渲染插槽內容', async () => {
    const wrapper = await mountSuspended(BaseButton, { slots: { default: () => '送出' } })
    expect(wrapper.text()).toContain('送出')
  })

  it('loading 時自動停用，避免重複送出', async () => {
    const wrapper = await mountSuspended(BaseButton, { props: { loading: true } })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true')
  })

  it('預設 type 為 button（不會意外送出所在的表單）', async () => {
    const wrapper = await mountSuspended(BaseButton)
    expect(wrapper.find('button').attributes('type')).toBe('button')
  })

  // 觸控目標尺寸：WCAG 與各行動平台建議至少 44×44px
  it('維持足夠的觸控目標高度', async () => {
    const wrapper = await mountSuspended(BaseButton)
    expect(wrapper.find('button').classes()).toContain('min-h-11')
  })

  it('blockOnMobile 讓按鈕在小螢幕撐滿寬度', async () => {
    const wrapper = await mountSuspended(BaseButton, { props: { blockOnMobile: true } })
    const classes = wrapper.find('button').classes()

    // mobile-first：預設滿版，sm 以上才變回自動寬度
    expect(classes).toContain('w-full')
    expect(classes).toContain('sm:w-auto')
  })
})

describe('UiBaseInput', () => {
  it('label 與 input 正確關聯（點 label 能聚焦 input）', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '電子郵件', modelValue: '' },
    })

    const inputId = wrapper.find('input').attributes('id')
    expect(inputId).toBeTruthy()
    expect(wrapper.find('label').attributes('for')).toBe(inputId)
  })

  it('顯示錯誤時設定 aria-invalid 與 aria-describedby', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '電子郵件', modelValue: '', error: '格式不正確' },
    })

    const input = wrapper.find('input')
    expect(input.attributes('aria-invalid')).toBe('true')

    // 錯誤訊息要被 aria-describedby 指到，螢幕閱讀器才會一起唸出來
    const describedBy = input.attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.find(`#${describedBy}`).text()).toBe('格式不正確')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('沒有錯誤時不設定 aria-invalid', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '電子郵件', modelValue: '' },
    })
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('false')
  })

  it('有錯誤時不同時顯示提示文字（避免訊息互相干擾）', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '密碼', modelValue: '', hint: '至少 8 個字元', error: '太短了' },
    })

    expect(wrapper.text()).toContain('太短了')
    expect(wrapper.text()).not.toContain('至少 8 個字元')
  })

  // iOS Safari 在 font-size < 16px 的輸入框聚焦時會自動放大整個頁面
  it('輸入框字級不小於 16px，避免 iOS 聚焦時放大頁面', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '電子郵件', modelValue: '' },
    })
    expect(wrapper.find('input').classes()).toContain('text-base')
  })

  it('v-model 雙向綁定生效', async () => {
    const wrapper = await mountSuspended(BaseInput, {
      props: { label: '電子郵件', modelValue: '' },
    })

    await wrapper.find('input').setValue('dev@example.com')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['dev@example.com'])
  })
})
