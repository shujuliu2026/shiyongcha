<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const CITIES = [
  '济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁',
  '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'
]

/** @param {number|null|undefined} aqi */
function chinaTone (aqi) {
  const n = Number(aqi)
  if (!Number.isFinite(n)) return 'none'
  if (n <= 50) return 'good'
  if (n <= 100) return 'fair'
  if (n <= 150) return 'light'
  if (n <= 200) return 'moderate'
  if (n <= 300) return 'heavy'
  return 'severe'
}

/** @param {number|null|undefined} aqi */
function chinaLevel (aqi) {
  const n = Number(aqi)
  if (!Number.isFinite(n)) return '未知'
  if (n <= 50) return '优'
  if (n <= 100) return '良'
  if (n <= 150) return '轻度污染'
  if (n <= 200) return '中度污染'
  if (n <= 300) return '重度污染'
  return '严重污染'
}

/** @param {number|null|undefined} aqi */
function chinaAdvice (aqi) {
  const n = Number(aqi)
  if (!Number.isFinite(n)) return '暂无数据'
  if (n <= 50) return '空气很好，适合户外'
  if (n <= 100) return '空气良好，可正常外出'
  if (n <= 150) return '敏感人群减少长时间户外'
  if (n <= 200) return '儿童老人减少户外剧烈运动'
  if (n <= 300) return '尽量减少外出，关闭门窗'
  return '避免户外，必要时戴口罩'
}

const city = ref('临沂')
const loading = ref(false)
const error = ref('')
const meta = ref(null)
const stations = ref(null)
const forecast = ref(null)
const showForecast = ref(false)

const summary = computed(() => {
  const items = stations.value?.items || []
  if (!items.length) return null
  const aqis = items.map((i) => Number(i.aqi)).filter((n) => Number.isFinite(n))
  const avg = aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null
  const worst = items.reduce((w, cur) => {
    if (!w) return cur
    return Number(cur.aqi) > Number(w.aqi) ? cur : w
  }, null)
  return {
    count: items.length,
    avg,
    level: chinaLevel(avg),
    tone: chinaTone(avg),
    advice: chinaAdvice(avg),
    worstStation: worst?.station || '',
    worstAqi: worst?.aqi ?? null,
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

async function loadStations () {
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams({ city: city.value.trim() || '临沂', limit: '40' })
    const res = await fetch(apiUrl(`/api/v1/env/air?${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    stations.value = body
  } catch (e) {
    stations.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function loadForecast () {
  try {
    const res = await fetch(apiUrl('/api/v1/weather/aqi'))
    const body = await res.json().catch(() => ({}))
    if (res.ok) forecast.value = body
  } catch {
    forecast.value = null
  }
}

function pickCity (name) {
  city.value = name
}

function shortHour (iso) {
  if (!iso) return ''
  const m = /T(\d{2}):/.exec(iso)
  return m ? `${m[1]}时` : iso
}

watch(city, () => {
  void loadStations()
})

onMounted(() => {
  void loadMeta()
  void loadStations()
  void loadForecast()
})
</script>

<template>
  <div class="page">
    <SubNav title="空气质量" />
    <div class="page__body">
      <p class="lead">
        山东国控站小时空气质量（公共数据开放网）。
        <template v-if="meta && !meta.configured">请配置 <code>SD_OPEN_CLIENT_*</code>。</template>
      </p>
      <p><CorrectBtn item="空气质量" :compact="false" /></p>

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

      <section v-if="summary" class="aqi-hero" :class="'aqi-hero--' + summary.tone">
        <div class="aqi-hero__num">{{ summary.avg ?? '—' }}</div>
        <div>
          <strong>{{ city }} · {{ summary.level }}</strong>
          <p>{{ summary.advice }}</p>
          <small class="muted">
            {{ summary.count }} 站 · 偏高 {{ summary.worstStation }} {{ summary.worstAqi ?? '—' }}
            <br>观测 {{ summary.time || '—' }}
          </small>
        </div>
      </section>

      <ul v-if="stations?.items?.length" class="env-list">
        <li v-for="(item, i) in stations.items" :key="(item.station_code || '') + i" class="env-card">
          <div class="env-card__head">
            <div class="env-card__title">
              <strong>{{ item.station || item.city }}</strong>
              <span class="muted">{{ item.city }}{{ item.area ? ' · ' + item.area : '' }}</span>
            </div>
            <div class="aqi-badge" :class="'aqi-hero--' + chinaTone(item.aqi)">
              <span class="aqi-badge__n">{{ item.aqi ?? '—' }}</span>
              <span class="aqi-badge__lv">{{ item.level || chinaLevel(item.aqi) }}</span>
            </div>
          </div>
          <div class="env-metrics">
            <span>PM2.5 <b>{{ item.pm25 ?? '—' }}</b></span>
            <span>PM10 <b>{{ item.pm10 ?? '—' }}</b></span>
            <span>O₃ <b>{{ item.o3 ?? '—' }}</b></span>
            <span>NO₂ <b>{{ item.no2 ?? '—' }}</b></span>
            <span>SO₂ <b>{{ item.so2 ?? '—' }}</b></span>
            <span>CO <b>{{ item.co ?? '—' }}</b></span>
          </div>
          <p class="env-card__note muted">
            <template v-if="item.primary && item.primary !== '—'">首污 {{ item.primary }} · </template>
            {{ item.time }}
          </p>
        </li>
      </ul>
      <p v-else-if="!loading && stations" class="muted">该市暂无站点数据。</p>

      <div class="local-block">
        <button type="button" class="btn btn--ghost" @click="showForecast = !showForecast">
          {{ showForecast ? '收起' : '展开' }} Open-Meteo 临沂预报
        </button>
        <template v-if="showForecast && forecast">
          <p class="muted" style="margin-top:10px">欧洲 AQI · {{ forecast.label }} · {{ forecast.level }}</p>
          <div v-if="forecast.hourly?.length" class="aqi-hours">
            <div v-for="h in forecast.hourly" :key="h.time" class="aqi-hours__item">
              <span>{{ shortHour(h.time) }}</span>
              <strong>{{ h.aqi ?? '—' }}</strong>
              <small>PM2.5 {{ h.pm25 ?? '—' }}</small>
            </div>
          </div>
        </template>
      </div>

      <p class="foot muted">
        {{ stations?.disclaimer || meta?.disclaimer || '仅供参考。' }}
        <br>
        <router-link to="/precip">查看山东站网降水量 →</router-link>
      </p>
      <button type="button" class="btn btn--ghost" :disabled="loading" @click="loadStations">刷新</button>
    </div>
  </div>
</template>
