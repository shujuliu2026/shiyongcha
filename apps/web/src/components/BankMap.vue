<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import L from '../leafletSetup.js'
import { APP_DEFAULT } from '../utils/cityDefault.js'

const props = defineProps({
  /** @type {{ cnaps: string, name: string, bank?: string, lat?: number, lng?: number, district?: string, geo_provider?: string, geo_address?: string }[]} */
  items: { type: Array, default: () => [] },
  activeCnaps: { type: String, default: '' }
})

const emit = defineEmits(['select'])

const mapEl = ref(null)

/** @type {import('leaflet').Map | null} */
let map = null
/** @type {import('leaflet').LayerGroup | null} */
let markers = null
/** @type {Map<string, import('leaflet').Marker>} */
const byCnaps = new Map()

const center = {
  lat: APP_DEFAULT?.lat ?? 35.104,
  lng: APP_DEFAULT?.lng ?? 118.356
}

/**
 * 同坐标点轻微散开，避免全部叠在一起
 * @param {number} lat
 * @param {number} lng
 * @param {number} index
 * @param {number} groupSize
 */
function jitter (lat, lng, index, groupSize) {
  if (groupSize <= 1) return [lat, lng]
  const r = 0.0012 * Math.ceil((index + 1) / 6)
  const ang = (index / groupSize) * Math.PI * 2
  return [lat + r * Math.cos(ang), lng + r * Math.sin(ang)]
}

function initMap () {
  if (!mapEl.value || map) return
  map = L.map(mapEl.value, {
    zoomControl: true,
    attributionControl: true
  }).setView([center.lat, center.lng], 11)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map)

  markers = L.layerGroup().addTo(map)
  redraw()
}

function redraw () {
  if (!map || !markers) return
  markers.clearLayers()
  byCnaps.clear()

  /** @type {Map<string, typeof props.items>} */
  const groups = new Map()
  for (const item of props.items) {
    if (item.lat == null || item.lng == null) continue
    if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) continue
    const key = `${Number(item.lat).toFixed(5)},${Number(item.lng).toFixed(5)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  /** @type {import('leaflet').LatLngExpression[]} */
  const bounds = []
  for (const [, group] of groups) {
    group.forEach((item, index) => {
      const [lat, lng] = jitter(Number(item.lat), Number(item.lng), index, group.length)
      const approx = item.geo_provider === 'district_approx'
      const m = L.circleMarker([lat, lng], {
        radius: approx ? 7 : 8,
        color: approx ? '#c45c26' : '#1a7a4c',
        weight: 2,
        fillColor: approx ? '#f0a060' : '#3cb371',
        fillOpacity: 0.85
      })
      const tip = approx
        ? '区县中心近似（非门牌）· 配置高德 Key 可精确定位'
        : (item.geo_address || item.geo_provider || '已定位')
      m.bindPopup(
        `<strong>${escapeHtml(item.name)}</strong><br/>` +
        `<span>${escapeHtml(item.bank || '')}</span><br/>` +
        `<code>${escapeHtml(item.cnaps)}</code><br/>` +
        `<small>${escapeHtml(tip)}</small>`
      )
      m.on('click', () => emit('select', item.cnaps))
      m.addTo(markers)
      byCnaps.set(item.cnaps, m)
      bounds.push([lat, lng])
    })
  }

  if (bounds.length >= 2) {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14)
  }
  focusActive()
}

function focusActive () {
  if (!map || !props.activeCnaps) return
  const m = byCnaps.get(props.activeCnaps)
  if (!m) return
  const ll = m.getLatLng()
  map.setView(ll, Math.max(map.getZoom(), 14))
  m.openPopup()
}

/**
 * @param {string} s
 */
function escapeHtml (s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

watch(() => props.items, () => nextTick(redraw), { deep: true })
watch(() => props.activeCnaps, () => focusActive())

onMounted(async () => {
  await nextTick()
  initMap()
  setTimeout(() => map?.invalidateSize(), 80)
})

onUnmounted(() => {
  map?.remove()
  map = null
  markers = null
  byCnaps.clear()
})

defineExpose({
  focusActive,
  invalidate () {
    map?.invalidateSize()
  }
})
</script>

<template>
  <div class="bank-map">
    <div ref="mapEl" class="bank-map__canvas" />
    <div class="bank-map__legend muted">
      <span class="bank-map__dot bank-map__dot--ok" />精确/缓存
      <span class="bank-map__dot bank-map__dot--approx" />区县近似
    </div>
    <p v-if="!items.some((i) => i.lat != null)" class="bank-map__empty muted">
      暂无坐标点。点列表「定位」，或配置 <code>AMAP_WEB_KEY</code> 后
      <code>npm run geocode:linyi-banks -- --force</code>。
    </p>
  </div>
</template>
