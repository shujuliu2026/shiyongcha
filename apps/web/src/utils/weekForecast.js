/**
 * 关注点 · 一周天气预报（Open-Meteo · 免 key）
 */

const TZ = 'Asia/Shanghai'

/** @type {Record<number, string>} */
const WMO_LABELS = {
  0: '晴',
  1: '晴',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾',
  51: '小雨',
  53: '小雨',
  55: '小雨',
  56: '冻雨',
  57: '冻雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪',
  80: '阵雨',
  81: '阵雨',
  82: '暴雨',
  85: '阵雪',
  86: '阵雪',
  95: '雷雨',
  96: '雷雨',
  99: '雷雨'
}

/**
 * @param {number | null | undefined} code
 */
export function weatherCodeLabel (code) {
  if (code == null) return '—'
  return WMO_LABELS[Number(code)] || '—'
}

/**
 * @param {string} isoDate YYYY-MM-DD
 */
function weekdayZh (isoDate) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: TZ,
      weekday: 'short'
    }).formatToParts(new Date(`${isoDate}T12:00:00+08:00`))
    return parts.find((p) => p.type === 'weekday')?.value || ''
  } catch {
    return ''
  }
}

/**
 * @param {string} isoDate
 */
function shortDate (isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return isoDate
  return `${Number(m[2])}/${Number(m[3])}`
}

function todayIsoShanghai () {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{
 *   lat: number,
 *   lng: number,
 *   fetched_at: string,
 *   days: Array<{
 *     date: string,
 *     date_short: string,
 *     weekday: string,
 *     is_today: boolean,
 *     weather_code: number | null,
 *     label: string,
 *     temp_max: number | null,
 *     temp_min: number | null,
 *     precip_mm: number | null,
 *     precip_prob: number | null,
 *     wind_max: number | null
 *   }>
 * } | null>}
 */
export async function fetchWeekForecast (lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(la))
  url.searchParams.set('longitude', String(ln))
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max'
    ].join(',')
  )
  url.searchParams.set('timezone', TZ)
  url.searchParams.set('forecast_days', '7')

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    const daily = data?.daily
    if (!daily?.time?.length) return null

    const today = todayIsoShanghai()
    const days = daily.time.map((date, i) => {
      const code = daily.weather_code?.[i] ?? null
      const tmax = daily.temperature_2m_max?.[i]
      const tmin = daily.temperature_2m_min?.[i]
      return {
        date,
        date_short: shortDate(date),
        weekday: weekdayZh(date),
        is_today: date === today,
        weather_code: code != null ? Number(code) : null,
        label: weatherCodeLabel(code),
        temp_max: tmax != null && Number.isFinite(Number(tmax)) ? Math.round(Number(tmax)) : null,
        temp_min: tmin != null && Number.isFinite(Number(tmin)) ? Math.round(Number(tmin)) : null,
        precip_mm:
          daily.precipitation_sum?.[i] != null
            ? Math.round(Number(daily.precipitation_sum[i]) * 10) / 10
            : null,
        precip_prob:
          daily.precipitation_probability_max?.[i] != null
            ? Math.round(Number(daily.precipitation_probability_max[i]))
            : null,
        wind_max:
          daily.wind_speed_10m_max?.[i] != null
            ? Math.round(Number(daily.wind_speed_10m_max[i]))
            : null
      }
    })

    return {
      lat: la,
      lng: ln,
      source: 'open-meteo',
      fetched_at: new Date().toISOString(),
      days
    }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
