<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const PAGE_SIZE = 40
const loading = ref(true)
const enriching = ref('')
const error = ref('')
const data = ref(null)
const level = ref('')
const q = ref('')
const page = ref(1)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/driving-schools?city=linyi'))
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
  const lv = level.value
  return (data.value?.items || []).filter((it) => {
    if (lv && it.level !== lv) return false
    if (!keyword) return true
    return `${it.name} ${it.org} ${it.scope} ${it.address || ''} ${it.address_hint || ''}`
      .toLowerCase()
      .includes(keyword)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filtered.value.slice(start, start + PAGE_SIZE)
})

watch([q, level], () => {
  page.value = 1
})

async function enrichOne (item) {
  enriching.value = item.id
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/enrich-place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'driving', id: item.id })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    Object.assign(item, body.item || {})
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    enriching.value = ''
  }
}

function mapsLink (item) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(item.address || item.name)}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="驾驶员培训机构" />
    <div class="page__body">
      <p class="lead">
        普通机动车驾驶员培训机构 · {{ data?.count || '—' }} 家（一/二/三级）。
      </p>

      <div class="form form--bank">
        <label>
          级别
          <select v-model="level">
            <option value="">全部级别</option>
            <option v-for="lv in data?.levels || ['一级','二级','三级']" :key="lv" :value="lv">{{ lv }}</option>
          </select>
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="驾校名 / 车型 / 管辖" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">
        匹配 {{ filtered.length }}
        <template v-if="filtered.length > PAGE_SIZE"> · {{ page }}/{{ totalPages }}</template>
      </p>

      <ul v-if="pageItems.length" class="batch-list">
        <li v-for="item in pageItems" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code>{{ item.level }}</code>
          </div>
          <div class="batch-list__hit">
            <span class="muted">{{ item.org }}</span>
            <span class="muted">{{ item.scope }}</span>
            <span v-if="item.address">{{ item.address }}</span>
            <span v-else class="muted">地址脱敏 · {{ item.address_hint || '—' }}</span>
            <div class="row">
              <button
                v-if="!item.address"
                type="button"
                class="btn btn--ghost"
                :disabled="enriching === item.id"
                @click="enrichOne(item)"
              >
                {{ enriching === item.id ? '补全中…' : '联网补全地址' }}
              </button>
              <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="filtered.length > PAGE_SIZE" class="row">
        <button type="button" class="btn btn--ghost" :disabled="page <= 1" @click="page--">上一页</button>
        <button type="button" class="btn btn--ghost" :disabled="page >= totalPages" @click="page++">下一页</button>
      </div>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
