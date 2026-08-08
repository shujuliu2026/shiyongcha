<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(false)
const error = ref('')
const list = ref(null)
const eew = ref(null)
const minMag = ref(3)
const nearOnly = ref(false)
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null

const items = computed(() => list.value?.items || [])
const attention = computed(() => list.value?.attention || [])
const watchLabel = computed(() => list.value?.watch?.label || '临沂')

async function loadList () {
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams({
      min_mag: String(minMag.value),
      limit: '50'
    })
    if (nearOnly.value) qs.set('near', '1')
    const res = await fetch(apiUrl(`/api/v1/national/earthquake/list?${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    list.value = body
  } catch (e) {
    list.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function loadEew () {
  try {
    const res = await fetch(apiUrl('/api/v1/national/earthquake/eew'))
    const body = await res.json().catch(() => ({}))
    if (res.ok) eew.value = body
  } catch {
    /* ignore */
  }
}

async function refresh () {
  await Promise.all([loadList(), loadEew()])
}

function magClass (tier) {
  return `eq-mag eq-mag--${tier || 'none'}`
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    void refresh()
  }, 120000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <SubNav title="地震通报" />
    <div class="page__body">
      <p class="lead">
        中国地震台网正式测定列表（第三方聚合）· 自动计算距
        {{ watchLabel }} 距离 · 约 2 分钟刷新
      </p>
      <p><CorrectBtn item="地震通报" :compact="false" /></p>

      <div
        v-if="eew?.active && eew.eew"
        class="eq-banner eq-banner--eew"
        role="alert"
      >
        <strong>地震预警（试推）</strong>
        <span>
          {{ eew.eew.location }} · M{{ eew.eew.magnitude }}
          · 深度 {{ eew.eew.depth_km ?? '—' }} km
          · 距{{ watchLabel }}约 {{ eew.eew.distance_km ?? '—' }} km
        </span>
      </div>

      <div
        v-else-if="attention.length"
        class="eq-banner eq-banner--near"
        role="status"
      >
        <strong>本地关注</strong>
        <span>
          近 {{ watchLabel }} 有 {{ attention.length }} 条需留意：
          {{ attention.slice(0, 2).map(q => `${q.location} M${q.magnitude}`).join('；') }}
        </span>
      </div>

      <div class="form form--bank">
        <label>
          最低震级
          <select v-model.number="minMag" @change="loadList">
            <option :value="0">全部</option>
            <option :value="3">≥ 3.0</option>
            <option :value="4">≥ 4.0</option>
            <option :value="5">≥ 5.0</option>
            <option :value="6">≥ 6.0</option>
          </select>
        </label>
        <label class="eq-check">
          <span>仅本地关注</span>
          <input v-model="nearOnly" type="checkbox" @change="loadList">
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn" :disabled="loading" @click="refresh">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <ul v-if="items.length" class="eq-list">
        <li
          v-for="q in items"
          :key="q.id"
          :class="{ 'eq-list__item--attention': q.local_attention }"
        >
          <div class="eq-list__top">
            <span :class="magClass(q.mag_tier)">M{{ q.magnitude ?? '—' }}</span>
            <strong>{{ q.location || '未知地点' }}</strong>
            <em v-if="q.local_attention">本地关注</em>
          </div>
          <div class="eq-list__meta muted">
            {{ q.time || '—' }}
            · 深度 {{ q.depth_km ?? '—' }} km
            · 距{{ watchLabel }} {{ q.distance_km != null ? `${q.distance_km} km` : '—' }}
            <template v-if="q.intensity"> · 烈度 {{ q.intensity }}</template>
            · {{ q.type === 'reviewed' ? '正式测定' : q.type || '速报' }}
          </div>
        </li>
      </ul>
      <p v-else-if="!loading" class="muted">暂无符合条件的地震记录</p>

      <p class="foot muted">
        {{ list?.disclaimer || '数据仅供参考，以中国地震台网 / 应急管理官方公告为准。' }}
        <template v-if="list?.fetched_at"> · 更新 {{ list.fetched_at }}</template>
      </p>
    </div>
  </div>
</template>
