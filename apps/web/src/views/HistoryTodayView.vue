<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const data = ref(null)
/** 用户选定的 MM-DD；空则用服务端「今天」 */
const date = ref('')
const bootstrapped = ref(false)
let syncingUrl = false

/**
 * @param {string} mmdd
 * @param {number} delta
 */
function shiftMmDd (mmdd, delta) {
  const m = Number(String(mmdd).slice(0, 2))
  const d = Number(String(mmdd).slice(3, 5))
  if (!m || !d) return mmdd
  const dt = new Date(2024, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function syncDateToUrl (mmdd) {
  const next = /^\d{2}-\d{2}$/.test(mmdd) ? mmdd : ''
  const cur = String(route.query.date || '')
  if (cur === next) return
  syncingUrl = true
  const query = { ...route.query }
  if (next) query.date = next
  else delete query.date
  router.replace({ query }).finally(() => {
    syncingUrl = false
  })
}

async function load () {
  loading.value = true
  error.value = ''
  try {
    const qs = date.value ? `?date=${encodeURIComponent(date.value)}` : ''
    const res = await fetch(apiUrl(`/api/v1/local/history-today${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
    if (!bootstrapped.value && body.date) {
      date.value = body.date
      bootstrapped.value = true
      syncDateToUrl(body.date)
    } else if (bootstrapped.value && date.value) {
      syncDateToUrl(date.value)
    }
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function yearLabel (y) {
  return y ? `${y} 年` : '时令 / 主题日'
}

function prevDay () {
  if (!date.value) return
  date.value = shiftMmDd(date.value, -1)
}

function nextDay () {
  if (!date.value) return
  date.value = shiftMmDd(date.value, 1)
}

function goToday () {
  date.value = ''
  bootstrapped.value = false
  void load()
}

const hasItems = computed(() => (data.value?.items || []).length > 0)
const fallbackItems = computed(() => data.value?.month_highlights || [])
const shareDesc = computed(() =>
  data.value?.label ? `临沂 · ${data.value.label}` : '临沂地方史速览'
)

onMounted(() => {
  const qDate = String(route.query.date || '')
  if (/^\d{2}-\d{2}$/.test(qDate)) {
    date.value = qDate
    bootstrapped.value = true
  }
  void load()
})

watch(date, (val, old) => {
  if (!bootstrapped.value) return
  if (val === old) return
  if (!/^\d{2}-\d{2}$/.test(String(val || ''))) return
  void load()
})

watch(
  () => route.query.date,
  (q) => {
    if (syncingUrl) return
    const qDate = String(q || '')
    if (/^\d{2}-\d{2}$/.test(qDate) && qDate !== date.value) {
      bootstrapped.value = true
      date.value = qDate
    }
  }
)
</script>

<template>
  <div class="page">
    <SubNav title="历史上的今天" :share-desc="shareDesc" />
    <div class="page__body">
      <p class="lead">临沂地方史速览 · 与便民电话 / 办事指南同属本地服务</p>
      <p class="muted" style="margin:-6px 0 14px;font-size:13px">
        想看老照片？
        <RouterLink to="/old-photos">临沂旧时光精选</RouterLink>
        ·
        <a href="https://www.linyilu.com/atlas" target="_blank" rel="noopener noreferrer">临忆录完整图集</a>
      </p>

      <div class="hist-nav">
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="prevDay">前一天</button>
        <label class="hist-nav__date">
          <span class="muted">月-日</span>
          <input v-model="date" type="text" placeholder="07-14" maxlength="5" inputmode="numeric">
        </label>
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="nextDay">后一天</button>
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="goToday">今天</button>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <template v-if="data && !loading">
        <h2 class="page__h2">{{ data.label }}</h2>
        <p class="muted" style="margin:-4px 0 12px;font-size:12px">
          目录共 {{ data.total_catalog }} 条 · {{ data.city }}
        </p>

        <article v-for="(it, i) in data.items" :key="'d'+i" class="guide-card">
          <h3 class="guide-card__title">{{ it.title }}</h3>
          <p class="guide-card__summary">{{ it.summary }}</p>
          <p class="muted" style="margin:8px 0 0;font-size:12px">
            {{ yearLabel(it.year) }}
            <template v-if="it.tags?.length"> · {{ it.tags.join(' / ') }}</template>
          </p>
          <p style="margin:8px 0 0"><CorrectBtn :item="it.title" :hint="it.summary || ''" /></p>
        </article>

        <template v-if="!hasItems">
          <p class="muted">该日暂无专条，本月相关条目：</p>
          <article v-for="(it, i) in fallbackItems" :key="'m'+i" class="guide-card">
            <h3 class="guide-card__title">{{ it.mmdd }} · {{ it.title }}</h3>
            <p class="guide-card__summary">{{ it.summary }}</p>
            <p class="muted" style="margin:8px 0 0;font-size:12px">
              {{ yearLabel(it.year) }}
              <template v-if="it.tags?.length"> · {{ it.tags.join(' / ') }}</template>
            </p>
          <p style="margin:8px 0 0"><CorrectBtn :item="it.title" :hint="it.summary || ''" /></p>
          </article>
        </template>

        <p class="foot muted">{{ data.disclaimer }}</p>
        <p v-if="data.source_note" class="foot muted">{{ data.source_note }}</p>
      </template>
    </div>
  </div>
</template>
