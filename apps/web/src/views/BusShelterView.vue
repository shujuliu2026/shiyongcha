<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const PAGE_SIZE = 40

const loading = ref(true)
const error = ref('')
const data = ref(null)
const owner = ref('')
const road = ref('')
const q = ref('')
const page = ref(1)
const copied = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/bus-shelters?city=linyi'))
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
  const ow = owner.value
  const rd = road.value
  return (data.value?.items || []).filter((it) => {
    if (ow && it.owner !== ow) return false
    if (rd && it.road !== rd) return false
    if (!keyword) return true
    const blob = `${it.address} ${it.road || ''} ${it.owner || ''} ${it.maintainer || ''}`.toLowerCase()
    return blob.includes(keyword)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))

const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filtered.value.slice(start, start + PAGE_SIZE)
})

watch([q, owner, road], () => {
  page.value = 1
})

async function copyText (text) {
  const v = String(text || '')
  if (!v) return
  try {
    await navigator.clipboard.writeText(v)
    copied.value = v
    window.setTimeout(() => {
      if (copied.value === v) copied.value = ''
    }, 1600)
  } catch {
    error.value = '复制失败，请长按手动选择'
  }
}

function mapsLink (item) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(item.address || '临沂公交站亭')}`
}

function clearFilters () {
  owner.value = ''
  road.value = ''
  q.value = ''
  page.value = 1
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="公交站亭位置" />
    <div class="page__body">
      <p class="lead">
        临沂公交站亭普查位置 · 共 {{ data?.count || '—' }} 处（取表第一列「位置」）。
        <RouterLink to="/bus-ic">IC卡网点</RouterLink>
        ·
        <RouterLink to="/bus">公交 GPS</RouterLink>
      </p>

      <div class="form form--bank">
        <label>
          道路
          <select v-model="road">
            <option value="">全部道路</option>
            <option
              v-for="r in data?.roads || []"
              :key="r.road"
              :value="r.road"
            >
              {{ r.road }}（{{ r.count }}）
            </option>
          </select>
        </label>
        <label>
          权属
          <select v-model="owner">
            <option value="">全部权属</option>
            <option v-for="o in data?.owners || []" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>
        <label>
          关键字
          <input
            v-model="q"
            type="search"
            placeholder="路名 / 门牌附近 / 地标"
            autocomplete="off"
          >
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="clearFilters">
          清空筛选
        </button>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>
      <p v-if="!loading && data" class="ok">
        匹配 {{ filtered.length }} 处
        <template v-if="filtered.length > PAGE_SIZE">
          · 第 {{ page }} / {{ totalPages }} 页
        </template>
      </p>

      <ul v-if="pageItems.length" class="batch-list">
        <li v-for="item in pageItems" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.address }}</strong>
            <code v-if="item.road">{{ item.road }}</code>
          </div>
          <div class="batch-list__hit">
            <span class="muted">
              {{ item.owner || '权属—' }}
              · {{ item.maintainer || '养护—' }}
            </span>
            <div class="row">
              <button type="button" class="btn btn--ghost" @click="copyText(item.address)">
                复制位置
              </button>
              <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
            </div>
          </div>
        </li>
      </ul>
      <p v-else-if="!loading && data" class="muted">无匹配站亭，尝试缩短关键字或换道路。</p>

      <div v-if="filtered.length > PAGE_SIZE" class="row">
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="page <= 1"
          @click="page = Math.max(1, page - 1)"
        >
          上一页
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="page >= totalPages"
          @click="page = Math.min(totalPages, page + 1)"
        >
          下一页
        </button>
      </div>

      <p class="foot muted">
        {{ data?.disclaimer }}
        <template v-if="data?.source?.file"> · 源表 {{ data.source.file }}</template>
        <template v-if="data?.updated"> · 清单 {{ data.updated }}</template>
      </p>
    </div>
  </div>
</template>
