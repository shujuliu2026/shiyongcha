/**
 * 山东公共数据开放网 · 空气质量 / 降水量（令牌签名代理）
 * 凭证：SD_OPEN_CLIENT_ID / SD_OPEN_CLIENT_SECRET（勿提交）
 *
 * 鉴权（官方《接口调用说明》）：
 * - Headers: X-Client-Id / X-Timestamp(ms, 10 分钟有效) / X-Nonce / X-Signature
 * - Signature = Base64(HmacSHA256(ClientId+Timestamp+Nonce, ClientSecret))
 * - 嵌入系统须先「申请接口」且审核通过；分页每页 ≤100
 * - GET 业务参走 query；POST 一般走 body（以各接口详情为准）
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const GATEWAY = 'https://data.sd.gov.cn/gateway'
const AIR_PATH = process.env.SD_OPEN_AIR_PATH || '/api/1/air_station_hourfy'
const PRECIP_PAGE_PATH =
  process.env.SD_OPEN_PRECIP_PAGE_PATH ||
  '/api/1.0/cataLog_8336c70137c04ac2b88bd5847356ea91/get_datalist_page'
const PRECIP_CITY_PATH = process.env.SD_OPEN_PRECIP_CITY_PATH || '/api/1/sdsjslsj'
const PRECIP_COUNT_PATH =
  process.env.SD_OPEN_PRECIP_COUNT_PATH ||
  '/api/1.0/cataLog_8336c70137c04ac2b88bd5847356ea91/get_data_count'

const SD_CITIES = [
  '济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁',
  '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'
]

/** @type {{ id: string, secret: string } | null} */
let credCache = null

/**
 * @returns {{ id: string, secret: string }}
 */
export function loadSdOpenCreds () {
  if (credCache) return credCache
  let id = String(process.env.SD_OPEN_CLIENT_ID || '').trim()
  let secret = String(process.env.SD_OPEN_CLIENT_SECRET || '').trim()
  if (!id || !secret) {
    try {
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
      const txt = fs.readFileSync(path.join(root, 'tool-api.txt'), 'utf8')
      const idM = /Client ID[：:]\s*\n?([a-f0-9]+)/i.exec(txt)
      const secM = /Client Secret[：:]\s*\n?([a-f0-9]+)/i.exec(txt)
      if (idM) id = idM[1]
      if (secM) secret = secM[1]
    } catch { /* optional local file */ }
  }
  credCache = { id, secret }
  return credCache
}

export function sdOpenConfigured () {
  const { id, secret } = loadSdOpenCreds()
  return Boolean(id && secret)
}

/**
 * 国标 AQI 分档（与国控站 Type 字段兼容）
 * @param {number|null|undefined} aqi
 */
export function chinaAqiTone (aqi) {
  const n = Number(aqi)
  if (!Number.isFinite(n)) return { tone: 'none', level: '未知', advice: '暂无数据' }
  if (n <= 50) return { tone: 'good', level: '优', advice: '空气很好，适合户外' }
  if (n <= 100) return { tone: 'fair', level: '良', advice: '空气良好，可正常外出' }
  if (n <= 150) return { tone: 'light', level: '轻度污染', advice: '敏感人群减少长时间户外' }
  if (n <= 200) return { tone: 'moderate', level: '中度污染', advice: '儿童老人减少户外剧烈运动' }
  if (n <= 300) return { tone: 'heavy', level: '重度污染', advice: '尽量减少外出，关闭门窗' }
  return { tone: 'severe', level: '严重污染', advice: '避免户外，必要时戴口罩' }
}

export function listEnvMeta () {
  return {
    configured: sdOpenConfigured(),
    cities: SD_CITIES,
    sources: {
      air: {
        path: AIR_PATH,
        portal: 'https://data.sd.gov.cn/portal/api/fc2e1c604c1a4e80a42a86bd9f12677d/detail',
        note: '山东省环境空气质量监测 · 小时级站点（需已申请该接口权限）'
      },
      precip: {
        pagePath: PRECIP_PAGE_PATH,
        cityPath: PRECIP_CITY_PATH,
        portal: 'https://data.sd.gov.cn/portal/catalog/20181203192046100500',
        note: '山东省109站降水量 · 历史数据集，非实时预报'
      }
    },
    disclaimer: '数据来自山东公共数据开放网，仅供参考，非预警或执法依据。'
  }
}

function createNonce () {
  // 与官方 Postman demo 一致：UUID
  return crypto.randomUUID()
}

function signHeaders (clientId, clientSecret) {
  const timestamp = String(Date.now())
  const nonce = createNonce()
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(clientId + timestamp + nonce)
    .digest('base64')
  return {
    'X-Client-Id': clientId,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
    Accept: 'application/json',
    'User-Agent': 'shiyongcha-sd-open/1.0'
  }
}

/**
 * @param {string} apiPath
 * @param {Record<string, string|number|undefined>} params
 */
async function gatewayGet (apiPath, params = {}) {
  const { id, secret } = loadSdOpenCreds()
  if (!id || !secret) {
    const err = new Error('未配置 SD_OPEN_CLIENT_ID / SD_OPEN_CLIENT_SECRET')
    err.status = 503
    err.code = 'sd_open_not_configured'
    throw err
  }
  const url = new URL(apiPath.startsWith('http') ? apiPath : `${GATEWAY}${apiPath}`)
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.SD_OPEN_TIMEOUT_MS) || 20000)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: signHeaders(id, secret),
      signal: ctrl.signal
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      const err = new Error(`开放网关非 JSON 响应 HTTP ${res.status}`)
      err.status = 502
      err.code = 'sd_open_bad_response'
      err.preview = text.slice(0, 200)
      throw err
    }
    const code = String(json?.code ?? '')
    if (code && code !== '200' && code !== '0') {
      const msg = String(json?.msg || `开放网关错误 code=${code}`)
      const forbidden = /权限/.test(msg)
      const err = new Error(
        forbidden
          ? `${msg}（请到开放网对该资源「申请接口」并等待审核通过后，再用同一 Client ID 调用）`
          : msg
      )
      err.status = forbidden ? 403 : 502
      err.code = forbidden ? 'sd_open_forbidden' : 'sd_open_upstream'
      err.upstream = json
      throw err
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

function normCity (s) {
  return String(s || '').trim().replace(/市$/, '')
}

/**
 * @param {unknown} v
 */
function formatAirTime (v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (Number.isFinite(n) && n > 1e11) {
    try {
      return new Date(n).toLocaleString('zh-CN', { hour12: false })
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/**
 * @param {Record<string, any>} row
 */
function mapAirRow (row) {
  return {
    city: row.City || '',
    area: row.Area || '',
    station: row.PositionName || '',
    station_code: row.UniqueCode || '',
    time: formatAirTime(row.Date ?? row.CreateTime),
    aqi: row.AQI != null ? Number(row.AQI) : null,
    level: row.Type || '',
    primary: row.PrimaryPollutant || '',
    pm25: row.PM2_5 != null ? Number(row.PM2_5) : null,
    pm10: row.PM10 != null ? Number(row.PM10) : null,
    so2: row.SO2 != null ? Number(row.SO2) : null,
    no2: row.NO2 != null ? Number(row.NO2) : null,
    o3: row.O3 != null ? Number(row.O3) : null,
    co: row.CO != null ? Number(row.CO) : null
  }
}

/**
 * @param {Record<string, any>} row
 */
function mapPrecipRow (row) {
  return {
    city: row.City || '',
    station: row.Station_Name || '',
    station_id: row.Station_Id_C || '',
    time: row.Datetime_CST || row.Datetime || '',
    precip_24h_mm: row.PRE_24h != null ? Number(row.PRE_24h) : null,
    lat: row.Lat != null ? Number(row.Lat) : null,
    lon: row.Lon != null ? Number(row.Lon) : null
  }
}

/**
 * @param {object} q
 * @param {string} [q.city]
 * @param {number|string} [q.start]
 * @param {number|string} [q.limit]
 */
export async function queryAirQuality (q = {}) {
  const city = normCity(q.city)
  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)
  const start = Math.max(Number(q.start) || 0, 0)

  // 上游仅 STARTNUM/PAGENUM，无城市入参；按城筛选时需翻页扫描
  if (city) {
    const pageSize = 100
    const maxScan = Number(process.env.SD_OPEN_AIR_MAX_SCAN) || 3000
    /** @type {ReturnType<typeof mapAirRow>[]} */
    const matched = []
    let cursor = 0
    while (matched.length < limit && cursor < maxScan) {
      const json = await gatewayGet(AIR_PATH, {
        STARTNUM: cursor,
        PAGENUM: pageSize
      })
      const batch = Array.isArray(json?.data) ? json.data : []
      if (!batch.length) break
      for (const row of batch) {
        const mapped = mapAirRow(row)
        if (
          normCity(mapped.city).includes(city) ||
          String(mapped.station).includes(city) ||
          String(mapped.area).includes(city)
        ) {
          matched.push(mapped)
          if (matched.length >= limit) break
        }
      }
      cursor += batch.length
      if (batch.length < pageSize) break
    }
    return {
      source: 'sd_open_air',
      total: matched.length,
      start: 0,
      scanned: cursor,
      items: matched,
      disclaimer: listEnvMeta().disclaimer
    }
  }

  const json = await gatewayGet(AIR_PATH, {
    STARTNUM: start,
    PAGENUM: limit
  })
  const items = (Array.isArray(json?.data) ? json.data : []).map(mapAirRow)
  return {
    source: 'sd_open_air',
    total: items.length,
    start,
    items,
    disclaimer: listEnvMeta().disclaimer
  }
}

/**
 * @param {object} q
 * @param {string} [q.city] 地市（推荐，走按市接口）
 * @param {number|string} [q.page]
 * @param {number|string} [q.limit]
 */
export async function queryPrecip (q = {}) {
  const city = normCity(q.city)
  const page = Math.max(Number(q.page) || 1, 1)
  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)

  if (city) {
    const json = await gatewayGet(PRECIP_CITY_PATH, { City: city })
    let items = (Array.isArray(json?.data) ? json.data : []).map(mapPrecipRow)
    items.sort((a, b) => String(b.time).localeCompare(String(a.time)))
    // 上游可能返回全市全部历史行，本地再按页切片
    const total = items.length
    const offset = (page - 1) * limit
    items = items.slice(offset, offset + limit)
    return {
      source: 'sd_open_precip_city',
      city: city.endsWith('市') ? city : `${city}市`,
      total,
      page,
      limit,
      items,
      disclaimer: listEnvMeta().disclaimer + ' 目录为历史站网降水样本。'
    }
  }

  const json = await gatewayGet(PRECIP_PAGE_PATH, { PAGE: page, PAGENUM: limit })
  const items = (Array.isArray(json?.data) ? json.data : []).map(mapPrecipRow)
  let count = null
  try {
    const c = await gatewayGet(PRECIP_COUNT_PATH, {})
    const row = Array.isArray(c?.data) ? c.data[0] : null
    count = row?.count != null ? Number(row.count) : null
  } catch { /* count optional */ }

  return {
    source: 'sd_open_precip_page',
    total: count ?? items.length,
    page,
    limit,
    items,
    disclaimer: listEnvMeta().disclaimer + ' 目录为历史站网降水样本。'
  }
}
