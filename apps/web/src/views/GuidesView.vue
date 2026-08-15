<script setup>
import { onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/guides?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="办事指南速查" />
    <div class="page__body">
      <p class="lead">常见政务办事入口说明 · 非真实办事系统</p>
      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <article v-for="g in data?.categories || []" :key="g.title" class="guide-card">
        <h2 class="guide-card__title">{{ g.title }}</h2>
        <p class="guide-card__summary">{{ g.summary }}</p>
        <ol class="guide-card__steps">
          <li v-for="(step, i) in g.steps" :key="i">{{ step }}</li>
        </ol>
        <p class="guide-card__entry muted">入口：{{ g.entry }}</p>
      </article>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
