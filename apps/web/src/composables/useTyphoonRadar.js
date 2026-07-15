/**
 * 台风雷达 · H5 数据与告警
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { fetchWeekForecast } from '../utils/weekForecast.js'
import { apiUrl } from '../utils/api.js'

const DEFAULT_WATCH = Object.freeze({
  lat: 35.104,
  lng: 118.356,
  label: '临沂',
  alertKm: 200
})

const STORAGE_KEY = 'shiyongcha_watch_v1'

function loadWatch () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_WATCH }
    const parsed = JSON.parse(raw)
    const lat = Number(parsed.lat)
    const lng = Number(parsed.lng)
    const alertKm = Number(parsed.alertKm)
    return {
      lat: Number.isFinite(lat) ? lat : DEFAULT_WATCH.lat,
      lng: Number.isFinite(lng) ? lng : DEFAULT_WATCH.lng,
      alertKm: Number.isFinite(alertKm) && alertKm > 0 ? alertKm : DEFAULT_WATCH.alertKm,
      label: typeof parsed.label === 'string' && parsed.label ? parsed.label : DEFAULT_WATCH.label
    }
  } catch {
    return { ...DEFAULT_WATCH }
  }
}

function saveWatch (w) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lat: w.lat,
      lng: w.lng,
      alertKm: w.alertKm,
      label: w.label || DEFAULT_WATCH.label
    }))
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ localOnly?: boolean }} [opts]
 */
export function useTyphoonRadar (opts = {}) {
  const initial = loadWatch()
  const watchLat = ref(initial.lat)
  const watchLng = ref(initial.lng)
  const alertKm = ref(initial.alertKm)
  const watchLabel = ref(opts.localOnly ? DEFAULT_WATCH.label : initial.label)

  const loading = ref(false)
  const locating = ref(false)
  const error = ref('')
  const activity = ref(null)
  const selectedTfid = ref('')
  const detail = ref(null)
  const detailLoading = ref(false)
  const radar = ref(null)
  const showRain = ref(true)
  const showTyphoon = ref(true)
  const sheetOpen = ref(false)
  const weekForecast = ref(null)
  const weekLoading = ref(false)

  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null
  const autoRefreshSec = 180

  const alerts = computed(() => activity.value?.alerts || [])
  const storms = computed(() => activity.value?.storms || [])
  const watchStorms = computed(() =>
    (activity.value?.storms || []).filter((s) => s.alert_tier && s.alert_tier !== 'none')
  )
  const hasAlert = computed(() => alerts.value.length > 0)
  const hasWatch = computed(() => watchStorms.value.length > 0)

  const topAlertTier = computed(() => {
    const rank = { danger: 3, warn: 2, watch: 1, none: 0 }
    let best = 'none'
    for (const s of watchStorms.value) {
      if ((rank[s.alert_tier] || 0) > (rank[best] || 0)) best = s.alert_tier
    }
    return best
  })

  const alertBannerText = computed(() => {
    if (!watchStorms.value.length) return ''
    return watchStorms.value
      .map((s) => {
        const dist = s.distance_km != null ? `${s.distance_km} km` : '距离未知'
        const tier = s.alert_tier_label || ''
        return `${tier ? `【${tier}】` : ''}${s.name || s.enname || s.tfid} 约 ${dist}`
      })
      .join('；')
  })

  function persist () {
    saveWatch({
      lat: Number(watchLat.value),
      lng: Number(watchLng.value),
      alertKm: Number(alertKm.value),
      label: watchLabel.value
    })
  }

  async function refreshActivity () {
    loading.value = true
    error.value = ''
    try {
      const qs = new URLSearchParams({
        lat: String(watchLat.value),
        lng: String(watchLng.value),
        alert_km: String(alertKm.value)
      })
      const res = await fetch(apiUrl(`/api/v1/weather/typhoon/activity?${qs}`))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
      activity.value = body
      if (!selectedTfid.value && body.storms?.length) {
        selectedTfid.value = body.storms[0].tfid
      } else if (selectedTfid.value && body.storms?.length) {
        const still = body.storms.some((s) => s.tfid === selectedTfid.value)
        if (!still) selectedTfid.value = body.storms[0].tfid
      }
    } catch (e) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function refreshDetail (tfid) {
    const id = String(tfid || '').trim()
    if (!id) {
      detail.value = null
      return
    }
    detailLoading.value = true
    try {
      const res = await fetch(apiUrl(`/api/v1/weather/typhoon/${encodeURIComponent(id)}`))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
      detail.value = body.typhoon
    } catch (e) {
      detail.value = null
      error.value = e?.message || String(e)
    } finally {
      detailLoading.value = false
    }
  }

  async function refreshRadar () {
    try {
      const res = await fetch(apiUrl('/api/v1/weather/radar/frames'))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
      radar.value = body
    } catch {
      radar.value = null
    }
  }

  async function refreshWeekForecast () {
    weekLoading.value = true
    try {
      weekForecast.value = await fetchWeekForecast(watchLat.value, watchLng.value)
    } finally {
      weekLoading.value = false
    }
  }

  async function refreshAll () {
    persist()
    await Promise.all([refreshActivity(), refreshRadar(), refreshWeekForecast()])
    if (selectedTfid.value) await refreshDetail(selectedTfid.value)
  }

  /** 本地天气页：预报 + 台风距离，不拉雷达/路径详情 */
  async function refreshLite () {
    persist()
    await Promise.all([refreshActivity(), refreshWeekForecast()])
  }

  function resetWatchToDefault () {
    watchLat.value = DEFAULT_WATCH.lat
    watchLng.value = DEFAULT_WATCH.lng
    alertKm.value = DEFAULT_WATCH.alertKm
    watchLabel.value = DEFAULT_WATCH.label
    persist()
  }

  function locateMe () {
    locating.value = true
    error.value = ''
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        error.value = '当前环境不支持定位'
        locating.value = false
        resolve(false)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          watchLat.value = Math.round(pos.coords.latitude * 1000) / 1000
          watchLng.value = Math.round(pos.coords.longitude * 1000) / 1000
          watchLabel.value = '我的位置'
          persist()
          locating.value = false
          resolve(true)
        },
        (err) => {
          error.value = err?.message || '定位失败'
          locating.value = false
          resolve(false)
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      )
    })
  }

  /**
   * @param {boolean} [lite]
   */
  function startAutoRefresh (lite = false) {
    stopAutoRefresh()
    timer = setInterval(() => {
      void (lite ? refreshLite() : refreshAll())
    }, autoRefreshSec * 1000)
  }

  function stopAutoRefresh () {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(selectedTfid, (id) => {
    void refreshDetail(id)
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    DEFAULT_WATCH,
    watchLat,
    watchLng,
    alertKm,
    watchLabel,
    loading,
    locating,
    error,
    activity,
    storms,
    alerts,
    watchStorms,
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
    refreshLite,
    refreshWeekForecast,
    locateMe,
    resetWatchToDefault,
    startAutoRefresh,
    stopAutoRefresh,
    persist
  }
}
