<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const LINE_H = 34

const props = defineProps({
  /** 左侧固定标签，如「公告」 */
  label: { type: String, required: true },
  /** @type {{ text: string, to?: string, href?: string, level?: string }[]} */
  items: { type: Array, default: () => [] },
  intervalMs: { type: Number, default: 3200 },
  tone: { type: String, default: 'default' }
})

const index = ref(0)
const sliding = ref(false)
let timer = null
let resetTimer = null

const lines = computed(() =>
  (props.items || []).filter((it) => it && String(it.text || '').trim())
)

const currentLevel = computed(() => {
  if (!lines.value.length) return ''
  const i = Math.min(index.value, lines.value.length - 1)
  return lines.value[i]?.level || ''
})

function clearTimers () {
  if (timer) clearInterval(timer)
  if (resetTimer) clearTimeout(resetTimer)
  timer = null
  resetTimer = null
}

function tick () {
  if (lines.value.length <= 1) return
  sliding.value = true
  index.value += 1
  if (index.value >= lines.value.length) {
    resetTimer = setTimeout(() => {
      sliding.value = false
      index.value = 0
    }, 420)
  }
}

function start () {
  clearTimers()
  index.value = 0
  sliding.value = false
  if (lines.value.length > 1) {
    timer = setInterval(tick, props.intervalMs)
  }
}

watch(lines, start)
onMounted(start)
onUnmounted(clearTimers)
</script>

<template>
  <div
    v-if="lines.length"
    class="ticker"
    :class="[
      'ticker--' + tone,
      currentLevel ? 'ticker--lv-' + currentLevel : null
    ]"
  >
    <span class="ticker__label">{{ label }}</span>
    <div class="ticker__viewport" aria-live="polite">
      <div
        class="ticker__track"
        :class="{ 'ticker__track--instant': !sliding }"
        :style="{ transform: `translateY(-${index * LINE_H}px)` }"
      >
        <template
          v-for="(it, i) in lines"
          :key="'a-' + i + '-' + it.text"
        >
          <RouterLink
            v-if="it.to"
            class="ticker__line"
            :to="it.to"
          >{{ it.text }}</RouterLink>
          <a
            v-else-if="it.href"
            class="ticker__line"
            :href="it.href"
            :target="it.href.startsWith('http') ? '_blank' : undefined"
            rel="noopener"
          >{{ it.text }}</a>
          <span
            v-else
            class="ticker__line"
          >{{ it.text }}</span>
        </template>
        <template v-if="lines.length > 1">
          <RouterLink
            v-if="lines[0].to"
            class="ticker__line"
            :to="lines[0].to"
          >{{ lines[0].text }}</RouterLink>
          <a
            v-else-if="lines[0].href"
            class="ticker__line"
            :href="lines[0].href"
            :target="lines[0].href.startsWith('http') ? '_blank' : undefined"
            rel="noopener"
          >{{ lines[0].text }}</a>
          <span
            v-else
            class="ticker__line"
          >{{ lines[0].text }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
