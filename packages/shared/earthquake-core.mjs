/**
 * 地震信息通报 · 中国地震台网数据（经 Wolfx 聚合，非官方）
 * https://api.wolfx.jp/cenc_eqlist.json
 * https://api.wolfx.jp/cenc_eew.json
 */
import { DEFAULT_WATCH, APP_CONFIG } from './config.mjs'
import { haversineKm, toNum } from './weather-radar-core.mjs'

export const CENC_EQLIST_URL = 'https://api.wolfx.jp/cenc_eqlist.json'
export const CENC_EEW_URL = 'https://api.wolfx.jp/cenc_eew.json'

/**
 * @param {number | null} mag
 * @returns {'strong'|'moderate'|'light'|'micro'|'none'}
 */
export function magnitudeTier (mag) {
  if (mag == null || !Number.isFinite(mag)) return 'none'
  if (mag >= 6) return 'strong'
  if (mag >= 5) return 'moderate'
  if (mag >= 4) return 'light'
  return 'micro'
}

/**
 * @param {number | null} mag
 * @param {number | null} distanceKm
 * @param {number} [nearKm]
 */
export function localAttention (mag, distanceKm, nearKm = 500) {
  if (distanceKm == null || mag == null) return false
  if (distanceKm <= nearKm && mag >= 4) return true
  if (distanceKm <= 200 && mag >= 3) return true
  if (distanceKm <= 100) return true
  return false
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ lat: number, lng: number, label?: string }} watch
 */
export function normalizeQuake (raw, watch = DEFAULT_WATCH) {
  const lat = toNum(raw.latitude)
  const lng = toNum(raw.longitude)
  const magnitude = toNum(raw.magnitude)
  const depth = toNum(raw.depth)
  let distanceKm = null
  if (lat != null && lng != null) {
    distanceKm = Math.round(haversineKm(watch.lat, watch.lng, lat, lng) * 10) / 10
  }
  const tier = magnitudeTier(magnitude)
  const attention = localAttention(magnitude, distanceKm)
  return {
    id: String(raw.EventID || `${raw.time || ''}_${lat}_${lng}`),
    type: String(raw.type || ''),
    time: raw.time ? String(raw.time) : null,
    report_time: raw.ReportTime ? String(raw.ReportTime) : null,
    location: String(raw.location || raw.placeName || ''),
    place_name: String(raw.placeName || raw.location || ''),
    magnitude,
    depth_km: depth,
    lat,
    lng,
    intensity: raw.intensity != null && raw.intensity !== '' ? String(raw.intensity) : null,
    distance_km: distanceKm,
    mag_tier: tier,
    local_attention: attention,
    watch_label: watch.label || APP_CONFIG.defaultCity.name
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
 * @param {Record<string, unknown>} raw
 */
function parseEqList (raw) {
  /** @type {Record<string, unknown>[]} */
  const rows = []
  for (const [k, v] of Object.entries(raw || {})) {
    if (!/^No\d+$/i.test(k)) continue
    if (v && typeof v === 'object') rows.push(/** @type {Record<string, unknown>} */ (v))
  }
  return rows
}

/**
 * @param {{ watchLat?: number, watchLng?: number, watchLabel?: string, minMag?: number, limit?: number, nearOnly?: boolean }} [opts]
 */
export async function fetchEarthquakeList (opts = {}) {
  const watch = {
    lat: toNum(opts.watchLat) ?? DEFAULT_WATCH.lat,
    lng: toNum(opts.watchLng) ?? DEFAULT_WATCH.lng,
    label: opts.watchLabel || DEFAULT_WATCH.label
  }
  const minMag = toNum(opts.minMag) ?? 0
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 50)
  const nearOnly = Boolean(opts.nearOnly)

  const raw = await fetchJson(CENC_EQLIST_URL)
  let items = parseEqList(raw)
    .map((r) => normalizeQuake(r, watch))
    .filter((q) => q.magnitude == null || q.magnitude >= minMag)

  if (nearOnly) {
    items = items.filter((q) => q.local_attention)
  }

  items.sort((a, b) => {
    const ta = a.time || ''
    const tb = b.time || ''
    return tb.localeCompare(ta)
  })

  items = items.slice(0, limit)
  const attention = items.filter((q) => q.local_attention)

  return {
    source: 'wolfx-cenc',
    upstream: '中国地震台网（非官方聚合）',
    fetched_at: new Date().toISOString(),
    md5: raw?.md5 ? String(raw.md5) : null,
    watch,
    count: items.length,
    attention_count: attention.length,
    items,
    attention,
    disclaimer: '数据来自第三方聚合，非正式预警通道。请以中国地震台网 / 应急管理部门公告为准。'
  }
}

/**
 * 中国地震台网 地震预警（可能无活跃事件）
 */
export async function fetchEarthquakeEew () {
  const raw = await fetchJson(CENC_EEW_URL)
  if (!raw || typeof raw !== 'object') {
    return { source: 'wolfx-cenc-eew', active: false, eew: null }
  }

  // 无预警时接口常返回空或占位
  const mag = toNum(raw.Magnitude ?? raw.magnitude)
  const lat = toNum(raw.Latitude ?? raw.latitude)
  const lng = toNum(raw.Longitude ?? raw.longitude)
  const has = Boolean(
    raw.EventID || raw.ID || (mag != null && (lat != null || raw.HypoCenter || raw.location))
  )

  const reportTime = raw.ReportTime || raw.OriginTime || null
  let ageMin = null
  if (reportTime) {
    const t = Date.parse(String(reportTime).replace(/-/g, '/'))
    if (Number.isFinite(t)) ageMin = (Date.now() - t) / 60000
  }
  // 超过 30 分钟视为历史样本，不当作正在预警
  const stale = ageMin != null && ageMin > 30

  if (!has || stale) {
    return {
      source: 'wolfx-cenc-eew',
      active: false,
      eew: null,
      last_sample: has
        ? {
            id: String(raw.EventID || raw.ID || ''),
            report_time: reportTime ? String(reportTime) : null,
            location: String(raw.HypoCenter || raw.location || ''),
            magnitude: mag,
            age_min: ageMin != null ? Math.round(ageMin) : null
          }
        : null,
      fetched_at: new Date().toISOString()
    }
  }

  const watch = DEFAULT_WATCH
  let distanceKm = null
  if (lat != null && lng != null) {
    distanceKm = Math.round(haversineKm(watch.lat, watch.lng, lat, lng) * 10) / 10
  }

  return {
    source: 'wolfx-cenc-eew',
    active: true,
    fetched_at: new Date().toISOString(),
    eew: {
      id: String(raw.EventID || raw.ID || ''),
      report_time: reportTime ? String(reportTime) : null,
      report_num: toNum(raw.ReportNum),
      origin_time: raw.OriginTime ? String(raw.OriginTime) : null,
      location: String(raw.HypoCenter || raw.location || ''),
      magnitude: mag,
      depth_km: toNum(raw.Depth),
      lat,
      lng,
      max_intensity: raw.MaxIntensity != null ? String(raw.MaxIntensity) : null,
      distance_km: distanceKm,
      local_attention: localAttention(mag, distanceKm, 800)
    },
    disclaimer: '预警存在延迟与误报可能，请以官方渠道为准。'
  }
}
