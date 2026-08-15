<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const q = ref('')
const onlyLinyi = ref(true)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/skill-subsidy?city=linyi'))
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
    if (onlyLinyi.value && !it.is_linyi) return false
    if (!keyword) return true
    return `${it.city} ${it.name} ${it.address || ''}`.toLowerCase().includes(keyword)
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
    <SubNav title="技能提升补贴经办" />
    <div class="page__body">
      <p class="lead">
        失业保险技能提升补贴经办机构 · 默认显示临沂 · 共 {{ data?.count || '—' }} 条省级表。
      </p>

      <div class="form form--bank">
        <label class="form__check">
          <input v-model="onlyLinyi" type="checkbox">
          仅临沂
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="地市 / 机构 / 地址" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }} 条</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <span class="muted">{{ item.city }}</span>
          </div>
          <div class="batch-list__hit">
            <span>{{ item.address || '地址未公布' }}</span>
            <button
              v-if="item.address"
              type="button"
              class="btn btn--ghost"
              @click="copyText(item.address)"
            >
              复制地址
            </button>
          </div>
          <p v-if="item.phone_masked" class="muted">电话：开放表脱敏</p>
          <p v-else-if="item.phone" class="muted">电话：{{ item.phone }}</p>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
