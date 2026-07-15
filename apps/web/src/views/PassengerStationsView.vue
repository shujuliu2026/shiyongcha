<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const enriching = ref('')
const error = ref('')
const data = ref(null)
const q = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/passenger-stations?city=linyi'))
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
  if (!keyword) return data.value?.items || []
  return (data.value?.items || []).filter((it) =>
    `${it.name} ${it.scope} ${it.address || ''} ${it.address_hint || ''}`.toLowerCase().includes(keyword)
  )
})

async function enrichOne (item) {
  enriching.value = item.id
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/enrich-place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'passenger', id: item.id })
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
    <SubNav title="道路客运场站" />
    <div class="page__body">
      <p class="lead">
        道路运输客运场站 · {{ data?.count || '—' }} 处。
        货运见 <RouterLink to="/freight-stations">货运场站</RouterLink> ·
        出行电话见 <RouterLink to="/transit">出行提示</RouterLink>。
      </p>

      <label class="form-inline">
        <input v-model="q" type="search" placeholder="场站名 / 经营范围">
      </label>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }}</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code>{{ item.scope }}</code>
          </div>
          <div class="batch-list__hit">
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

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
