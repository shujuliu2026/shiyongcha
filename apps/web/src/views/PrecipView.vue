<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const CITIES = [
  '济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁',
  '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'
]

const city = ref('临沂')
const page = ref(1)
const loading = ref(false)
const error = ref('')
const meta = ref(null)
const result = ref(null)

const summary = computed(() => {
  const items = result.value?.items || []
  if (!items.length) return null
  const mm = items.map((i) => Number(i.precip_24h_mm)).filter((n) => Number.isFinite(n))
  return {
    total: result.value?.total ?? items.length,
    page: result.value?.page || page.value,
    max: mm.length ? Math.max(...mm) : null,
    time: items[0]?.time || ''
  }
})

async function loadMeta () {
  try {
    const res = await fetch(apiUrl('/api/v1/env/meta'))
    meta.value = await res.json()
  } catch {
    meta.value = null
  }
}

async function load () {
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams({
      city: city.value.trim() || '临沂',
      page: String(page.value),
      limit: '40'
    })
    const res = await fetch(apiUrl(`/api/v1/env/precip?${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    result.value = body
  } catch (e) {
    result.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function pickCity (name) {
  city.value = name
  page.value = 1
}

function nextPage () {
  page.value += 1
  void load()
}

function prevPage () {
  if (page.value <= 1) return
  page.value -= 1
  void load()
}

watch(city, () => {
  page.value = 1
  void load()
})

onMounted(() => {
  void loadMeta()
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="降水量" />
    <div class="page__body">
      <p class="lead">
        山东省 109 站降水量（公共数据开放网）。目录含历史样本，非短临预报。
        <template v-if="meta && !meta.configured">请配置 <code>SD_OPEN_CLIENT_*</code>。</template>
      </p>
      <p><CorrectBtn item="降水量" :compact="false" /></p>

      <div class="env-chips" aria-label="地市">
        <button
          v-for="c in (meta?.cities || CITIES)"
          :key="c"
          type="button"
          class="env-chip"
          :class="{ 'is-active': city === c }"
          @click="pickCity(c)"
        >
          {{ c }}
        </button>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <div v-if="summary" class="env-summary">
        <div class="env-summary__cell">
          <span class="env-summary__label">记录</span>
          <strong>{{ summary.total }}</strong>
        </div>
        <div class="env-summary__cell">
          <span class="env-summary__label">页</span>
          <strong>{{ summary.page }}</strong>
        </div>
        <div class="env-summary__cell">
          <span class="env-summary__label">本页最大</span>
          <strong>{{ summary.max != null ? summary.max + ' mm' : '—' }}</strong>
        </div>
        <div class="env-summary__cell env-summary__cell--wide">
          <span class="env-summary__label">时间</span>
          <strong class="env-summary__muted">{{ summary.time || '—' }}</strong>
        </div>
      </div>

      <div class="row env-pager">
        <button type="button" class="btn btn--ghost" :disabled="loading || page <= 1" @click="prevPage">上一页</button>
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="nextPage">下一页</button>
        <button type="button" class="btn" :disabled="loading" @click="load">刷新</button>
      </div>

      <ul v-if="result?.items?.length" class="env-list">
        <li
          v-for="(item, i) in result.items"
          :key="(item.station_id || '') + item.time + i"
          class="env-card"
        >
          <div class="env-card__head">
            <div class="env-card__title">
              <strong>{{ item.station || item.city }}</strong>
              <span class="muted">{{ item.city }}</span>
            </div>
            <div class="precip-badge">
              <span class="precip-badge__n">{{ item.precip_24h_mm ?? '—' }}</span>
              <span class="precip-badge__u">mm / 24h</span>
            </div>
          </div>
          <p class="env-card__note muted">
            {{ item.time }}
            <template v-if="item.lat != null"> · {{ item.lat }}, {{ item.lon }}</template>
          </p>
        </li>
      </ul>
      <p v-else-if="!loading && result" class="muted">无降水记录。</p>

      <p class="foot muted">
        {{ result?.disclaimer || meta?.disclaimer || '仅供参考。' }}
        <br>
        <router-link to="/aqi">返回空气质量 →</router-link>
      </p>
    </div>
  </div>
</template>
