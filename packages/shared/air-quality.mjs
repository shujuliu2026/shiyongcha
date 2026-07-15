/**
 * 空气质量 · Open-Meteo Air Quality API（免 key）
 */
import { APP_CONFIG } from './config.mjs'

/**
 * @param {number} eaqi European AQI
 */
export function aqiLevel (eaqi) {
  const v = Number(eaqi)
  if (!Number.isFinite(v)) return { level: '未知', color: 'muted', advice: '暂无数据' }
  if (v <= 20) return { level: '优', color: 'good', advice: '空气很好，适合户外活动' }
  if (v <= 40) return { level: '良', color: 'fair', advice: '空气良好，可正常外出' }
  if (v <= 60) return { level: '轻度污染', color: 'light', advice: '敏感人群减少长时间户外' }
  if (v <= 80) return { level: '中度污染', color: 'moderate', advice: '儿童老人减少户外剧烈运动' }
  if (v <= 100) return { level: '重度污染', color: 'heavy', advice: '尽量减少外出，关闭门窗' }
  return { level: '严重污染', color: 'severe', advice: '避免户外活动，必要时戴口罩' }
}

/**
 * @param {{ lat?: number, lng?: number, label?: string }} [opts]
 */
export async function fetchAirQuality (opts = {}) {
  const lat = Number(opts.lat ?? APP_CONFIG.defaultCity.lat)
  const lng = Number(opts.lng ?? APP_CONFIG.defaultCity.lng)
  const label = opts.label || APP_CONFIG.defaultCity.name
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error('invalid_coords')
    err.status = 400
    throw err
  }

  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set(
    'current',
    'european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone'
  )
  url.searchParams.set(
    'hourly',
    'european_aqi,pm10,pm2_5'
  )
  url.searchParams.set('timezone', 'Asia/Shanghai')
  url.searchParams.set('forecast_days', '2')

  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`open_meteo_aqi_http_${res.status}`)
    err.status = 502
    throw err
  }
  const data = await res.json()
  const cur = data.current || {}
  const eaqi = cur.european_aqi
  const meta = aqiLevel(eaqi)

  /** @type {{ time: string, aqi: number|null, pm25: number|null }[]} */
  const hourly = []
  const times = data.hourly?.time || []
  const aqis = data.hourly?.european_aqi || []
  const pm25s = data.hourly?.pm2_5 || []
  const now = cur.time || ''
  for (let i = 0; i < times.length; i++) {
    if (now && times[i] < now) continue
    hourly.push({
      time: times[i],
      aqi: aqis[i] ?? null,
      pm25: pm25s[i] ?? null
    })
    if (hourly.length >= 24) break
  }

  return {
    label,
    lat,
    lng,
    time: cur.time || null,
    european_aqi: eaqi ?? null,
    us_aqi: cur.us_aqi ?? null,
    ...meta,
    pollutants: {
      pm2_5: cur.pm2_5 ?? null,
      pm10: cur.pm10 ?? null,
      o3: cur.ozone ?? null,
      no2: cur.nitrogen_dioxide ?? null,
      so2: cur.sulphur_dioxide ?? null,
      co: cur.carbon_monoxide ?? null
    },
    hourly,
    source: 'Open-Meteo Air Quality',
    disclaimer: '欧洲 AQI 标准，仅供参考；以本地生态环境部门实时发布为准'
  }
}
