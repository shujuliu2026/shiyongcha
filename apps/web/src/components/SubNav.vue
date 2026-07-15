<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { buildShareText, sharePage } from '../composables/useShare.js'

const props = defineProps({
  title: { type: String, required: true },
  backTo: { type: String, default: '/' },
  /** 是否显示分享；运营后台等应关闭 */
  share: { type: Boolean, default: true },
  /** 分享附加说明 */
  shareDesc: { type: String, default: '' }
})

const tip = ref('')
let tipTimer = 0

async function onShare () {
  const desc = props.shareDesc.trim()
  const result = await sharePage({
    title: `${props.title} · 实用查`,
    text: buildShareText(props.title, desc && desc !== props.title ? desc : ''),
    url: window.location.href
  })
  tip.value =
    result === 'shared'
      ? '已分享'
      : result === 'copied'
        ? '链接已复制'
        : result === 'failed'
          ? '分享失败'
          : ''
  if (tip.value) {
    window.clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => {
      tip.value = ''
    }, 1600)
  }
}
</script>

<template>
  <header class="subnav">
    <RouterLink class="subnav__back" :to="backTo">←</RouterLink>
    <h1>{{ title }}</h1>
    <button
      v-if="share"
      type="button"
      class="subnav__share"
      aria-label="分享"
      @click="onShare"
    >
      分享
    </button>
    <span v-else class="subnav__spacer" />
    <div v-if="tip" class="subnav__toast" role="status">{{ tip }}</div>
  </header>
</template>
