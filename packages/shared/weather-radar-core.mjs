/**
 * 台风路径 + 降水雷达（公开源）· 距离告警核心
 * 台风：浙江省水利厅 typhoon.slt.zj.gov.cn
 * 雨层：RainViewer public tiles
 */
import { DEFAULT_WATCH } from './config.mjs'

export { DEFAULT_WATCH }

export const TYPHOON_SLT_BASE = 'https://typhoon.slt.zj.gov.cn'
export const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json'

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} 球面大致距离 km
 */
export function haversineKm (lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function toNum (v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {unknown} v
 * @returns {number | null} 半径 km；空串视为 null
 */
function parseRadiusKm (v) {
  if (v == null || v === '') return null
  if (typeof v === 'string' && v.includes(',')) {
    const parts = v.split(',').map((x) => Number(String(x).trim())).filter((n) => Number.isFinite(n) && n > 0)
    if (!parts.length) return null
    return Math.max(...parts)
  }
  const n = toNum(v)
  return n != null && n > 0 ? n : null
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeActivityItem (raw) {
  const lat = toNum(raw.lat ?? raw.centerlat)
  const lng = toNum(raw.lng ?? raw.centerlng)
  return {
    tfid: String(raw.tfid || ''),
    name: String(raw.name || ''),
    enname: String(raw.enname || ''),
    lat,
    lng,
    strong: String(raw.strong || ''),
    power: toNum(raw.power),
    pressure: toNum(raw.pressure),
    speed: toNum(raw.speed),
    movespeed: toNum(raw.movespeed),
    movedirection: String(raw.movedirection || ''),
    radius7: parseRadiusKm(raw.radius7),
    radius10: parseRadiusKm(raw.radius10),
    time: raw.time ? String(raw.time) : null,
    timeformate: raw.timeformate ? String(raw.timeformate) : null,
    warnlevel: raw.warnlevel != null ? String(raw.warnlevel) : null
  }
}

/**
 * @param {Record<string, unknown>} pt
 */
function normalizeTrackPoint (pt) {
  return {
    time: pt.time ? String(pt.time) : null,
    lat: toNum(pt.lat),
    lng: toNum(pt.lng),
    strong: String(pt.strong || ''),
    power: toNum(pt.power),
    speed: toNum(pt.speed),
    pressure: toNum(pt.pressure),
    movespeed: toNum(pt.movespeed),
    movedirection: String(pt.movedirection || ''),
    radius7: parseRadiusKm(pt.radius7),
    radius10: parseRadiusKm(pt.radius10),
    radius12: parseRadiusKm(pt.radius12)
  }
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeTyphoonDetail (raw) {
  const points = Array.isArray(raw.points) ? raw.points.map(normalizeTrackPoint) : []
  const last = points.length ? points[points.length - 1] : null
  const centerLat = toNum(raw.centerlat) ?? last?.lat ?? null
  const centerLng = toNum(raw.centerlng) ?? last?.lng ?? null

  /** @type {Array<{ agency: string, points: ReturnType<typeof normalizeTrackPoint>[] }>} */
  const forecasts = []
  if (last && Array.isArray(raw.points) && raw.points.length) {
    const lastRaw = raw.points[raw.points.length - 1]
    const forecastBlocks = Array.isArray(lastRaw?.forecast) ? lastRaw.forecast : []
    for (const block of forecastBlocks) {
      const agency = String(block?.tm || '未知')
      const fps = Array.isArray(block?.forecastpoints) ? block.forecastpoints : []
      forecasts.push({
        agency,
        points: fps.map(normalizeTrackPoint).filter((p) => p.lat != null && p.lng != null)
      })
    }
  }

  return {
    tfid: String(raw.tfid || ''),
    name: String(raw.name || ''),
    enname: String(raw.enname || ''),
    isactive: String(raw.isactive ?? '') === '1' || raw.isactive === 1 || raw.isactive === true,
    warnlevel: raw.warnlevel != null ? String(raw.warnlevel) : null,
    starttime: raw.starttime ? String(raw.starttime) : null,
    endtime: raw.endtime ? String(raw.endtime) : null,
    lat: centerLat,
    lng: centerLng,
    points: points.filter((p) => p.lat != null && p.lng != null),
    forecasts,
    land: Array.isArray(raw.land) ? raw.land : []
  }
}

/**
 * @param {number | null} distanceKm
 * @param {number} alertKm
 * @returns {'danger' | 'warn' | 'watch' | 'none'}
 */
export function distanceAlertTier (distanceKm, alertKm) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 'none'
  const base = Number.isFinite(alertKm) && alertKm > 0 ? alertKm : DEFAULT_WATCH.alertKm
  const dangerKm = Math.max(50, base * 0.5)
  const warnKm = base
  const watchKm = base * 1.5
  if (distanceKm <= dangerKm) return 'danger'
  if (distanceKm <= warnKm) return 'warn'
  if (distanceKm <= watchKm) return 'watch'
  return 'none'
}

/**
 * @param {'danger' | 'warn' | 'watch' | 'none'} tier
 */
export function alertTierLabel (tier) {
  if (tier === 'danger') return '危险接近'
  if (tier === 'warn') return '进入告警圈'
  if (tier === 'watch') return '关注'
  return ''
}

/**
 * @param {object} opts
 * @param {number} opts.watchLat
 * @param {number} opts.watchLng
 * @param {number} opts.alertKm
 * @param {ReturnType<typeof normalizeActivityItem>} storm
 */
export function attachDistanceAlert (opts, storm) {
  const { watchLat, watchLng, alertKm } = opts
  let distanceKm = null
  if (storm.lat != null && storm.lng != null) {
    distanceKm = Math.round(haversineKm(watchLat, watchLng, storm.lat, storm.lng) * 10) / 10
  }
  const tier = distanceAlertTier(distanceKm, alertKm)
  const alert = tier === 'danger' || tier === 'warn'
  return {
    ...storm,
    distance_km: distanceKm,
    alert,
    alert_tier: tier,
    alert_tier_label: alertTierLabel(tier),
    alert_km: alertKm
  }
}

/**
 * @param {number} [timeoutMs]
 */
async function fetchJson (url, timeoutMs = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) {
      const err = new Error(`upstream_${res.status}`)
      err.status = res.status
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

/**
 * @param {{ watchLat?: number, watchLng?: number, alertKm?: number }} [opts]
 */
export async function fetchTyphoonActivity (opts = {}) {
  const watchLat = toNum(opts.watchLat) ?? DEFAULT_WATCH.lat
  const watchLng = toNum(opts.watchLng) ?? DEFAULT_WATCH.lng
  const alertKm = toNum(opts.alertKm) ?? DEFAULT_WATCH.alertKm
  const raw = await fetchJson(`${TYPHOON_SLT_BASE}/Api/TyhoonActivity`)
  const list = Array.isArray(raw) ? raw : []
  const storms = list
    .map(normalizeActivityItem)
    .filter((s) => s.tfid)
    .map((s) => attachDistanceAlert({ watchLat, watchLng, alertKm }, s))
    .sort((a, b) => {
      const da = a.distance_km ?? Number.POSITIVE_INFINITY
      const db = b.distance_km ?? Number.POSITIVE_INFINITY
      return da - db
    })

  const alerts = storms.filter((s) => s.alert)
  return {
    source: 'zj-slt',
    fetched_at: new Date().toISOString(),
    watch: { lat: watchLat, lng: watchLng, alert_km: alertKm },
    count: storms.length,
    alert_count: alerts.length,
    storms,
    alerts
  }
}

/**
 * @param {string} tfid
 */
export async function fetchTyphoonDetail (tfid) {
  const id = String(tfid || '').replace(/[^\dA-Za-z_-]/g, '')
  if (!id) {
    const err = new Error('invalid_tfid')
    err.status = 400
    throw err
  }
  const raw = await fetchJson(`${TYPHOON_SLT_BASE}/Api/TyphoonInfo/${encodeURIComponent(id)}`)
  return {
    source: 'zj-slt',
    fetched_at: new Date().toISOString(),
    typhoon: normalizeTyphoonDetail(raw)
  }
}

/**
 * RainViewer 帧列表（雨层雷达）
 */
export async function fetchRainRadarFrames () {
  const raw = await fetchJson(RAINVIEWER_MAPS_URL)
  const host = String(raw?.host || 'https://tilecache.rainviewer.com').replace(/\/$/, '')
  const past = Array.isArray(raw?.radar?.past) ? raw.radar.past : []
  const nowcast = Array.isArray(raw?.radar?.nowcast) ? raw.radar.nowcast : []
  const frames = [...past, ...nowcast].map((f) => ({
    time: Number(f.time) || 0,
    path: String(f.path || ''),
    tile_url: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`
  })).filter((f) => f.path)

  const latest = frames.length ? frames[frames.length - 1] : null
  return {
    source: 'rainviewer',
    fetched_at: new Date().toISOString(),
    host,
    frame_count: frames.length,
    latest,
    frames
  }
}
