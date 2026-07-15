<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import L from '../leafletSetup.js'
import { useTyphoonRadar } from '../composables/useTyphoonRadar.js'
import { buildShareText, sharePage } from '../composables/useShare.js'

const route = useRoute()
const shareTip = ref('')
let shareTipTimer = 0

async function onShare () {
  const result = await sharePage({
    title: '台风天气 · 实用查',
    text: buildShareText('台风天气', '路径 · 雨层 · 预报 · 告警'),
    url: window.location.href
  })
  shareTip.value = result === 'shared' ? '已分享' : result === 'copied' ? '链接已复制' : result === 'failed' ? '分享失败' : ''
  if (shareTip.value) {
    window.clearTimeout(shareTipTimer)
    shareTipTimer = window.setTimeout(() => { shareTip.value = '' }, 1600)
  }
}

const {
  watchLat,
  watchLng,
  alertKm,
  watchLabel,
  loading,
  locating,
  error,
  storms,
  hasAlert,
  hasWatch,
  topAlertTier,
  alertBannerText,
  selectedTfid,
  detail,
  detailLoading,
  radar,
  showRain,
  showTyphoon,
  sheetOpen,
  weekForecast,
  weekLoading,
  refreshAll,
  locateMe,
  resetWatchToDefault,
  startAutoRefresh,
  stopAutoRefresh,
  persist
} = useTyphoonRadar()

const mapEl = ref(null)
/** @type {import('leaflet').Map | null} */
let map = null
/** @type {import('leaflet').LayerGroup | null} */
let typhoonGroup = null
/** @type {import('leaflet').TileLayer | null} */
let rainLayer = null
/** @type {import('leaflet').Marker | null} */
let watchMarker = null
/** @type {import('leaflet').Circle | null} */
let alertCircle = null

const buildStamp = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''
const fromLocal = computed(() => route.query.from === 'local-weather')

const selectedStorm = computed(() => storms.value.find((s) => s.tfid === selectedTfid.value) || null)

const rainTimeLabel = computed(() => {
  const t = radar.value?.latest?.time
  if (!t) return ''
  try {
    return new Date(t * 1000).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
})

const nearestLine = computed(() => {
  const s = storms.value[0]
  if (!s) return '暂无活跃台风'
  const dist = s.distance_km != null ? `${s.distance_km} km` : '—'
  return `${s.name || s.enname} · ${dist}`
})

const todayForecast = computed(() => weekForecast.value?.days?.find((d) => d.is_today) || weekForecast.value?.days?.[0] || null)

const todayChip = computed(() => {
  const d = todayForecast.value
  if (!d) return weekLoading.value ? '天气预报加载中…' : ''
  const hi = d.temp_max != null ? `${d.temp_max}°` : '—'
  const lo = d.temp_min != null ? `${d.temp_min}°` : '—'
  return `今日 ${d.label} ${lo}~${hi}`
})

function applyQueryTfid () {
  const id = String(route.query.tfid || '').trim()
  if (id) selectedTfid.value = id
}

function watchIcon () {
  return L.divIcon({
    className: 'ty-marker-wrap',
    html: '<div class="ty-marker ty-marker--watch"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  })
}

function eyeIcon () {
  return L.divIcon({
    className: 'ty-marker-wrap',
    html: '<div class="ty-marker ty-marker--eye"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

function addBasemap () {
  if (!map) return
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map)
}

function syncRainLayer () {
  if (!map) return
  if (rainLayer) {
    map.removeLayer(rainLayer)
    rainLayer = null
  }
  if (!showRain.value) return
  const url = radar.value?.latest?.tile_url
  if (!url) return
  rainLayer = L.tileLayer(url, {
    opacity: 0.62,
    zIndex: 350,
    maxZoom: 12,
    attribution: 'RainViewer'
  })
  rainLayer.addTo(map)
}

function syncWatchLayers () {
  if (!map) return
  const lat = Number(watchLat.value)
  const lng = Number(watchLng.value)
  const km = Number(alertKm.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

  if (watchMarker) map.removeLayer(watchMarker)
  watchMarker = L.marker([lat, lng], { icon: watchIcon(), zIndexOffset: 800 })
    .bindPopup(`${watchLabel.value || '关注点'}<br>${lat.toFixed(3)}, ${lng.toFixed(3)}`)
    .addTo(map)

  if (alertCircle) map.removeLayer(alertCircle)
  if (Number.isFinite(km) && km > 0) {
    alertCircle = L.circle([lat, lng], {
      radius: km * 1000,
      color: '#e07a3d',
      weight: 1.5,
      dashArray: '6 4',
      fillColor: '#e07a3d',
      fillOpacity: 0.07,
      interactive: false
    }).addTo(map)
  }
}

function fitInteresting (latlngs) {
  if (!map || !latlngs.length) return
  try {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 7 })
  } catch {
    /* ignore */
  }
}

function drawTyphoon () {
  if (!map) return
  if (typhoonGroup) {
    map.removeLayer(typhoonGroup)
    typhoonGroup = null
  }
  if (!showTyphoon.value) return

  typhoonGroup = L.layerGroup().addTo(map)
  /** @type {import('leaflet').LatLngExpression[]} */
  const fitPts = [[Number(watchLat.value), Number(watchLng.value)]]

  const t = detail.value
  if (t?.points?.length) {
    const track = t.points
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => /** @type {[number, number]} */ ([p.lat, p.lng]))
    if (track.length) {
      L.polyline(track, { color: '#5eb0e0', weight: 3, opacity: 0.9 }).addTo(typhoonGroup)
      fitPts.push(...track)
    }

    const last = t.points[t.points.length - 1]
    if (last?.lat != null && last?.lng != null) {
      L.marker([last.lat, last.lng], { icon: eyeIcon(), zIndexOffset: 900 })
        .bindPopup(
          `<strong>${t.name || t.enname || t.tfid}</strong><br>` +
            `${last.strong || ''} · ${last.pressure ?? '—'} hPa<br>${last.time || ''}`
        )
        .addTo(typhoonGroup)

      if (last.radius7) {
        L.circle([last.lat, last.lng], {
          radius: last.radius7 * 1000,
          color: '#3cb371',
          weight: 1,
          fillOpacity: 0.08,
          interactive: false
        }).addTo(typhoonGroup)
      }
      if (last.radius10) {
        L.circle([last.lat, last.lng], {
          radius: last.radius10 * 1000,
          color: '#d64545',
          weight: 1,
          fillOpacity: 0.1,
          interactive: false
        }).addTo(typhoonGroup)
      }
    }

    const china = (t.forecasts || []).find((f) => f.agency === '中国') || (t.forecasts || [])[0]
    if (china?.points?.length) {
      const fp = china.points.map((p) => /** @type {[number, number]} */ ([p.lat, p.lng]))
      L.polyline(fp, { color: '#f0c674', weight: 2, dashArray: '8 6', opacity: 0.95 }).addTo(typhoonGroup)
      fitPts.push(...fp)
    }
  } else {
    for (const s of storms.value) {
      if (s.lat == null || s.lng == null) continue
      fitPts.push([s.lat, s.lng])
      L.marker([s.lat, s.lng], { icon: eyeIcon() })
        .bindPopup(`<strong>${s.name || s.enname}</strong><br>${s.strong || ''} · ${s.distance_km ?? '—'} km`)
        .addTo(typhoonGroup)
    }
  }

  if (fitPts.length > 1) fitInteresting(fitPts)
}

function initMap () {
  if (!mapEl.value || map) return
  map = L.map(mapEl.value, {
    center: [Number(watchLat.value), Number(watchLng.value)],
    zoom: 6,
    zoomControl: false,
    attributionControl: true
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  addBasemap()
  syncWatchLayers()
  syncRainLayer()
  drawTyphoon()
}

function destroyMap () {
  if (map) {
    map.remove()
    map = null
  }
  typhoonGroup = null
  rainLayer = null
  watchMarker = null
  alertCircle = null
}

async function applyWatch () {
  persist()
  syncWatchLayers()
  await refreshAll()
  drawTyphoon()
  syncRainLayer()
}

async function onLocate () {
  const ok = await locateMe()
  if (ok) await applyWatch()
}

async function onReset () {
  resetWatchToDefault()
  await applyWatch()
}

function selectStorm (tfid) {
  selectedTfid.value = tfid
  sheetOpen.value = true
}

onMounted(async () => {
  await nextTick()
  initMap()
  applyQueryTfid()
  if (fromLocal.value) {
    resetWatchToDefault()
    syncWatchLayers()
  } else {
    const located = await locateMe()
    if (located) syncWatchLayers()
  }
  await refreshAll()
  applyQueryTfid()
  syncRainLayer()
  drawTyphoon()
  if (route.query.tfid) sheetOpen.value = true
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
  destroyMap()
})

watch(() => route.query.tfid, () => {
  applyQueryTfid()
  if (route.query.tfid) sheetOpen.value = true
})
watch([showRain, radar], () => syncRainLayer())
watch([showTyphoon, detail, storms], () => drawTyphoon())
watch([watchLat, watchLng, alertKm], () => syncWatchLayers())
</script>

<template>
  <div
    class="app"
    :class="{
      'app--alert': hasAlert,
      'app--watch': hasWatch && !hasAlert,
      [`app--tier-${topAlertTier}`]: hasWatch
    }"
  >
    <header class="top">
      <div class="top__brand">
        <RouterLink class="top__back" to="/">←</RouterLink>
        <img src="/icon.svg" alt="" width="28" height="28">
        <div>
          <h1>台风天气</h1>
          <p>路径 · 雨层 · 预报 · 告警</p>
        </div>
      </div>
      <div class="top__actions">
        <button type="button" class="btn btn--ghost" @click="onShare">分享</button>
        <RouterLink
          v-if="fromLocal"
          class="btn btn--ghost"
          to="/local-weather"
        >
          临沂天气
        </RouterLink>
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="applyWatch">
          {{ loading ? '…' : '刷新' }}
        </button>
      </div>
      <div v-if="shareTip" class="subnav__toast" role="status">{{ shareTip }}</div>
    </header>

    <div
      v-if="hasWatch"
      class="banner"
      :class="`banner--${topAlertTier}`"
      role="alert"
    >
      <strong>{{ topAlertTier === 'danger' ? '危险接近' : topAlertTier === 'warn' ? '告警' : '关注' }}</strong>
      <span>{{ alertBannerText }}（阈值 {{ alertKm }} km）</span>
    </div>

    <div class="map-shell">
      <div ref="mapEl" class="map" role="img" aria-label="台风雨层地图" />

      <div class="hud">
        <div class="hud__chip">{{ nearestLine }}</div>
        <RouterLink
          v-if="todayChip"
          class="hud__chip hud__chip--wx"
          to="/local-weather"
        >
          {{ todayChip }} · 临沂预报 ›
        </RouterLink>
        <div class="hud__toggles">
          <label><input v-model="showRain" type="checkbox"> 雨层</label>
          <label><input v-model="showTyphoon" type="checkbox"> 台风</label>
        </div>
      </div>

      <div class="fab">
        <button type="button" class="fab__btn" :disabled="locating" @click="onLocate">
          {{ locating ? '定位中' : '定位' }}
        </button>
        <button type="button" class="fab__btn fab__btn--sec" @click="sheetOpen = !sheetOpen">
          {{ sheetOpen ? '收起' : '设置' }}
        </button>
      </div>
    </div>

    <aside class="sheet" :class="{ 'sheet--open': sheetOpen }">
      <div class="sheet__handle" @click="sheetOpen = !sheetOpen" />
      <div class="sheet__body">
        <h2>关注点</h2>
        <div class="form">
          <label>名称<input v-model="watchLabel" type="text" maxlength="32" @change="persist"></label>
          <label>纬度<input v-model.number="watchLat" type="number" step="0.001"></label>
          <label>经度<input v-model.number="watchLng" type="number" step="0.001"></label>
          <label>告警 km<input v-model.number="alertKm" type="number" step="10" min="10" max="2000"></label>
        </div>
        <div class="row">
          <button type="button" class="btn" :disabled="loading" @click="applyWatch">应用</button>
          <button type="button" class="btn btn--ghost" @click="onReset">临沂</button>
          <button type="button" class="btn btn--ghost" :disabled="locating" @click="onLocate">我的位置</button>
        </div>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="rainTimeLabel" class="muted">雨层时间 {{ rainTimeLabel }}</p>

        <p class="wx-cross muted">
          关注点一周预报见
          <RouterLink to="/local-weather">临沂天气</RouterLink>
          （默认临沂坐标）
        </p>

        <h2>活跃台风</h2>
        <p v-if="!loading && !storms.length" class="muted">当前暂无活跃台风</p>
        <ul class="storms">
          <li
            v-for="s in storms"
            :key="s.tfid"
            :class="{
              active: s.tfid === selectedTfid,
              alert: s.alert,
              [`tier-${s.alert_tier || 'none'}`]: true
            }"
          >
            <button type="button" @click="selectStorm(s.tfid)">
              <span class="storms__name">
                {{ s.name || s.enname }}
                <em v-if="s.alert_tier_label">{{ s.alert_tier_label }}</em>
              </span>
              <span class="storms__meta">
                {{ s.strong || '—' }} · {{ s.distance_km != null ? `${s.distance_km} km` : '—' }}
              </span>
            </button>
          </li>
        </ul>

        <div v-if="selectedStorm || detail" class="detail">
          <h3>
            {{ detail?.name || selectedStorm?.name || selectedTfid }}
            <small v-if="detailLoading">加载中…</small>
          </h3>
          <p v-if="detail" class="muted">
            中心 {{ detail.lat?.toFixed?.(2) ?? '—' }}, {{ detail.lng?.toFixed?.(2) ?? '—' }}
            · 路径 {{ detail.points?.length || 0 }} 点
          </p>
        </div>

        <p class="foot muted">
          数据仅供参考 · 浙江水利厅台风 / RainViewer / Open-Meteo / OSM·CARTO 底图
          <template v-if="buildStamp"> · build {{ buildStamp }}</template>
        </p>
      </div>
    </aside>
  </div>
</template>
