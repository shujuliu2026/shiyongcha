<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const enriching = ref('')
const error = ref('')
const data = ref(null)
const district = ref('')
const q = ref('')
const copied = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/training-orgs?city=linyi'))
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
  const dist = district.value
  return (data.value?.items || []).filter((it) => {
    if (dist && it.district !== dist) return false
    if (!keyword) return true
    const blob = [
      it.name,
      it.alias,
      it.contact,
      it.district,
      it.address,
      it.address_hint,
      it.phone,
      it.note
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(keyword)
  })
})

const enrichedCount = computed(
  () => (data.value?.items || []).filter((x) => x.address && x.address_source && x.address_source !== 'open_data').length
)
const phoneCount = computed(() => (data.value?.items || []).filter((x) => x.phone).length)

async function enrichOne (item) {
  enriching.value = item.id
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/enrich-place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'training', id: item.id, force: true })
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

function dial (tel) {
  if (!tel) return
  window.location.href = `tel:${String(tel).replace(/[^\d+]/g, '')}`
}

function mapsLink (item) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(item.address || item.name)}`
}

function sourceLabel (item) {
  const map = {
    amap: '高德',
    public_listing: '公开信息',
    open_data: '开放网',
    previous: '缓存',
    hedong_gov: '河东区公开'
  }
  return map[item.address_source] || item.address_source || ''
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="职业培训机构" />
    <div class="page__body">
      <p class="lead">
        职业培训机构目录 · {{ data?.count || '—' }} 家（源表 202508040915）。
        已补全地址 {{ enrichedCount }} · 电话 {{ phoneCount }}。
      </p>

      <div class="form form--bank">
        <label>
          区县
          <select v-model="district">
            <option value="">全部区县</option>
            <option v-for="d in data?.districts || []" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label>
          关键字
          <input
            v-model="q"
            type="search"
            placeholder="机构名 / 别名 / 路名 / 联系人"
            autocomplete="off"
          >
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }}</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code v-if="item.district">{{ item.district }}</code>
            <code v-if="item.contact">{{ item.contact }}</code>
          </div>
          <div class="batch-list__hit">
            <span v-if="item.alias" class="muted">又名 {{ item.alias }}</span>
            <span v-if="item.address">{{ item.address }}</span>
            <span v-else class="muted">地址脱敏 · 线索：{{ item.address_hint || item.address_raw || '—' }}</span>
            <span v-if="item.phone">电话 {{ item.phone }}</span>
            <span v-else class="muted">电话脱敏</span>
            <span v-if="item.note" class="muted">{{ item.note }}</span>
            <span v-if="item.address_source" class="muted">地址来源 {{ sourceLabel(item) }}</span>
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
              <button
                v-if="item.phone"
                type="button"
                class="btn btn--ghost"
                @click="dial(item.phone)"
              >
                拨号
              </button>
              <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
            </div>
          </div>
        </li>
      </ul>

      <p class="foot muted">
        {{ data?.disclaimer }}
        <template v-if="data?.source?.file"> · 源表 {{ data.source.file }}</template>
      </p>
    </div>
  </div>
</template>
