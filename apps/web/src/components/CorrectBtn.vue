<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const props = defineProps({
  /** 条目标题（网点名 / 编码 / 医院名等） */
  item: { type: String, default: '' },
  /** 补充说明（地址、电话等） */
  hint: { type: String, default: '' },
  /** 紧凑样式（列表行内） */
  compact: { type: Boolean, default: true }
})

const route = useRoute()

const to = computed(() => {
  const query = {
    type: 'content',
    from: route.fullPath
  }
  const item = String(props.item || '').trim().slice(0, 160)
  const hint = String(props.hint || '').trim().slice(0, 240)
  if (item) query.item = item
  if (hint) query.hint = hint
  return { path: '/feedback', query }
})
</script>

<template>
  <RouterLink
    class="correct-btn"
    :class="{ 'correct-btn--compact': compact }"
    :to="to"
    title="内容纠错"
  >
    纠错
  </RouterLink>
</template>
