<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const q = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/edu-bases?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  return (data.value?.items || []).filter((it) => {
    if (!keyword) return true
    return `${it.name} ${it.id}`.toLowerCase().includes(keyword)
  })
})

async function copyText (text) {
  try {
    await navigator.clipboard.writeText(String(text || ''))
  } catch {
    error.value = '复制失败'
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="继续教育基地" />
    <div class="page__body">
      <p class="lead">
        临沂市专业技术人员继续教育基地名单 · 共 {{ data?.count || '—' }} 家。
      </p>

      <div class="form form--bank">
        <label>
          关键字
          <input v-model="q" type="search" placeholder="基地名称" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }} 条</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id + item.name">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <span class="muted">#{{ item.id }}</span>
          </div>
          <div class="batch-list__hit">
            <button type="button" class="btn btn--ghost" @click="copyText(item.name)">复制名称</button>
          </div>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
