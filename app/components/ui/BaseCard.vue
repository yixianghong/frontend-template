<script setup lang="ts">
/**
 * 基礎卡片容器。提供 header / default / footer 三個插槽。
 */
withDefaults(defineProps<{ title?: string; padded?: boolean }>(), { padded: true })
</script>

<template>
  <article
    class="rounded-xl border border-border bg-surface-raised transition hover:border-brand-300"
  >
    <header v-if="title || $slots.header" class="border-b border-border px-5 py-4">
      <slot name="header">
        <h2 class="text-fluid-lg font-semibold">{{ title }}</h2>
      </slot>
    </header>

    <div :class="padded ? 'px-5 py-4' : ''">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="border-t border-border px-5 py-3">
      <slot name="footer" />
    </footer>
  </article>
</template>
