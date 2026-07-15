<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const district = ref('')
const type = ref('')
const q = ref('')
const copied = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/bus-ic?city=linyi'))
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
  const typ = type.value
  return (data.value?.items || []).filter((it) => {
    if (dist && it.district !== dist) return false
    if (typ && it.type !== typ) return false
    if (!keyword) return true
    const blob = `${it.name} ${it.address} ${it.district} ${it.type} ${it.hours || ''}`.toLowerCase()
    return blob.includes(keyword)
  })
})

const grouped = computed(() => {
  /** @type {Map<string, typeof filtered.value>} */
  const map = new Map()
  for (const it of filtered.value) {
    const key = it.district || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
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
  const q = [item.name, item.address].filter(Boolean).join(' ')
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(q || '临沂公交')}`
}

function dialHotline () {
  window.location.href = 'tel:05398313159'
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="公交IC卡网点" />
    <div class="page__body">
      <p class="lead">
        临沂公交 IC 卡办理 / 充值网点 · 共 {{ data?.count || '—' }} 处。
        实时车辆见 <RouterLink to="/bus">公交 GPS</RouterLink>；
        站亭见 <RouterLink to="/bus-shelters">位置普查</RouterLink>。
      </p>

      <div class="form form--bank">
        <label>
          区域
          <select v-model="district">
            <option value="">全部区域</option>
            <option v-for="d in data?.districts || []" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label>
          类型
          <select v-model="type">
            <option value="">全部类型</option>
            <option v-for="t in data?.types || []" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="网点名 / 路名 / 银行" autocomplete="off">
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn btn--ghost" @click="dialHotline">热线 0539-8313159</button>
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="loading"
          @click="district = ''; type = ''; q = ''"
        >
          清空筛选
        </button>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }} 处</p>

      <section v-for="group in grouped" :key="group.name" class="local-block">
        <h2 class="page__h2">{{ group.name }}（{{ group.items.length }}）</h2>
        <ul class="batch-list">
          <li v-for="item in group.items" :key="item.name + item.address">
            <div class="batch-list__in">
              <strong>{{ item.name }}</strong>
              <code>{{ item.type }}</code>
            </div>
            <div class="batch-list__hit">
              <span>{{ item.address }}</span>
              <span v-if="item.hours" class="muted">营业：{{ item.hours }}</span>
              <div class="row">
                <button type="button" class="btn btn--ghost" @click="copyText(item.address)">复制地址</button>
                <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <p v-if="!loading && data && !filtered.length" class="muted">无匹配网点，尝试更换区域或关键字。</p>

      <p class="foot muted">
        {{ data?.disclaimer }}
        <template v-if="data?.source?.file"> · 源表 {{ data.source.file }}</template>
        <template v-if="data?.updated"> · 清单 {{ data.updated }}</template>
      </p>
    </div>
  </div>
</template>
