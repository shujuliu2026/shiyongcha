<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const PAGE_SIZE = 40
const loading = ref(true)
const enriching = ref('')
const error = ref('')
const data = ref(null)
const org = ref('')
const q = ref('')
const page = ref(1)
const copied = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/freight-stations?city=linyi'))
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
  const o = org.value
  return (data.value?.items || []).filter((it) => {
    if (o && it.org !== o) return false
    if (!keyword) return true
    const blob = `${it.name} ${it.org} ${it.scope} ${it.address || ''} ${it.address_hint || ''}`.toLowerCase()
    return blob.includes(keyword)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filtered.value.slice(start, start + PAGE_SIZE)
})
const enrichedCount = computed(
  () => (data.value?.items || []).filter((x) => x.address && x.address_source && x.address_source !== 'open_data').length
)

watch([q, org], () => {
  page.value = 1
})

async function enrichOne (item) {
  enriching.value = item.id
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/enrich-place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'freight', id: item.id })
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

async function copyText (text) {
  const v = String(text || '')
  if (!v) return
  try {
    await navigator.clipboard.writeText(v)
    copied.value = v
  } catch {
    error.value = '复制失败'
  }
}

function mapsLink (item) {
  const kw = item.address || item.name
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(kw)}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="道路货运场站" />
    <div class="page__body">
      <p class="lead">
        全市道路货运场站 · {{ data?.count || '—' }} 处（出行交通类）。
        开放网第三列地址脱敏
        <template v-if="enrichedCount"> · 已联网补全 {{ enrichedCount }}</template>。
        <RouterLink to="/transit">客运提示</RouterLink>
      </p>

      <div class="form form--bank">
        <label>
          管辖机构
          <select v-model="org">
            <option value="">全部</option>
            <option v-for="o in data?.orgs || []" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="场站名 / 经营范围 / 地址" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>
      <p v-if="!loading && data" class="ok">
        匹配 {{ filtered.length }}
        <template v-if="filtered.length > PAGE_SIZE"> · {{ page }}/{{ totalPages }}</template>
      </p>
      <p v-if="data?.enrich_hint" class="muted">{{ data.enrich_hint }}</p>

      <ul v-if="pageItems.length" class="batch-list">
        <li v-for="item in pageItems" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code>{{ item.org }}</code>
          </div>
          <div class="batch-list__hit">
            <span v-if="item.address">{{ item.address }}</span>
            <span v-else class="muted">地址脱敏 · 线索：{{ item.address_hint || item.address_raw || '—' }}</span>
            <span class="muted">{{ item.scope }}</span>
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
              <button
                v-if="item.address"
                type="button"
                class="btn btn--ghost"
                @click="copyText(item.address)"
              >
                复制地址
              </button>
              <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
              <CorrectBtn :item="item.name" :hint="item.address || item.address_hint || ''" />
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
