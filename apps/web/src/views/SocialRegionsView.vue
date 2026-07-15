<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const q = ref('')
const kind = ref('all')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/social-regions?city=linyi'))
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
  const keyword = q.value.trim()
  return (data.value?.items || []).filter((it) => {
    if (kind.value === 'unemployment' && !it.unemployment) return false
    if (kind.value === 'pension' && !it.pension) return false
    if (kind.value === 'injury' && !it.injury) return false
    if (!keyword) return true
    return `${it.name} ${it.code} ${it.agency}`.includes(keyword)
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
    <SubNav title="社保区划编码" />
    <div class="page__body">
      <p class="lead">
        失业 / 养老 / 工伤统筹区划编码 · 共 {{ data?.count || '—' }} 条（人社社保类）。
      </p>

      <div class="form form--bank">
        <label>
          险种
          <select v-model="kind">
            <option value="all">全部</option>
            <option value="unemployment">失业保险</option>
            <option value="pension">养老保险</option>
            <option value="injury">工伤保险</option>
          </select>
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="区划名 / 编码" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }} 条</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.code">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code>{{ item.code }}</code>
          </div>
          <div class="batch-list__hit">
            <span class="muted">
              {{ item.agency }}
              ·
              {{
                [
                  item.unemployment ? '失业' : '',
                  item.pension ? '养老' : '',
                  item.injury ? '工伤' : ''
                ].filter(Boolean).join(' / ')
              }}
            </span>
            <button type="button" class="btn btn--ghost" @click="copyText(item.code)">复制编码</button>
          </div>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
