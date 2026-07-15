/**
 * 临沂公共数据开放网 · 公交车 GPS / 站点代理
 *
 * 上游：http://lydata.sd.gov.cn/gateway/api/1/gjcGPSjzdsjxx
 * 鉴权（官方调用说明）：
 *   X-Client-Id / X-Timestamp(ms, 10 分钟有效) / X-Nonce / X-Signature
 *   Signature = Base64(HmacSHA256(ClientId + Timestamp + Nonce, ClientSecret))
 * 分页：STARTNUM、PAGENUM（均须 URL 编码；GET）
 *
 * 凭证：LYDATA_CLIENT_ID + LYDATA_CLIENT_SECRET
 * （未配 Secret 时回退 SD_OPEN_CLIENT_*，便于同门户令牌复用）
 *
 * @see docs/临沂开放数据-公交GPS.md
 */
import crypto from 'crypto'

const GATEWAY =
  process.env.LYDATA_BUS_GATEWAY ||
  'http://lydata.sd.gov.cn/gateway/api/1/gjcGPSjzdsjxx'

const CACHE_TTL_MS = Math.max(5_000, Number(process.env.LYDATA_BUS_CACHE_MS || 20_000))
const PAGE_SIZE = Math.min(100, Math.max(1, Number(process.env.LYDATA_BUS_PAGE_SIZE || 100)))
const MAX_FETCH = Math.min(2000, Math.max(PAGE_SIZE, Number(process.env.LYDATA_BUS_MAX_FETCH || 500)))

/** @type {{ at: number, rows: BusVehicle[] } | null} */
let cache = null

/**
 * @typedef {{
 *   id: string,
 *   plate: string,
 *   vehicle_id: string,
 *   line_id: string,
 *   line_version: string,
 *   lat: number|null,
 *   lng: number|null,
 *   speed: number|null,
 *   direction: number|null,
 *   station_seq: number|null,
 *   entry_exit: string,
 *   up_down: string,
 *   status: string,
 *   gps_time: string,
 *   updated_at: string,
 *   created_at: string
 * }} BusVehicle
 */

/**
 * @returns {{ id: string, secret: string }}
 */
export function loadLydataCreds () {
  let id = String(process.env.LYDATA_CLIENT_ID || '').trim()
  let secret = String(process.env.LYDATA_CLIENT_SECRET || '').trim()
  if (!id) id = String(process.env.SD_OPEN_CLIENT_ID || '').trim()
  if (!secret) secret = String(process.env.SD_OPEN_CLIENT_SECRET || '').trim()
  return { id, secret }
}

export function lydataBusConfigured () {
  const { id, secret } = loadLydataCreds()
  return Boolean(id && secret)
}

export function lydataBusMeta () {
  const { id, secret } = loadLydataCreds()
  return {
    configured: Boolean(id && secret),
    has_client_id: Boolean(id),
    has_client_secret: Boolean(secret),
    gateway: GATEWAY,
    cache_ttl_ms: CACHE_TTL_MS,
    page_size: PAGE_SIZE,
    max_fetch: MAX_FETCH,
    source: {
      title: '临沂市_市公交公司_办公室_公交车GPS及站点数据信息查询服务',
      portal:
        'http://lydata.sd.gov.cn/linyi/api/index?filterParam=org_code_enterprise&filterParamCode=9137130016829134XT&page=1',
      detail: 'http://lydata.sd.gov.cn/linyi/api/2b8a60ca4d124610a590ff56b6e56033/detail',
      publisher: '临沂市公共交通集团有限公司',
      method: 'GET',
      open: '无条件开放（须申请令牌并签名调用）'
    },
    auth: {
      headers: ['X-Client-Id', 'X-Timestamp', 'X-Nonce', 'X-Signature'],
      sign: 'Base64(HmacSHA256(ClientId+Timestamp+Nonce, ClientSecret))',
      params: ['STARTNUM', 'PAGENUM']
    },
    setup_hint:
      '在 lydata.sd.gov.cn 注册 → 用户中心「我的令牌」复制 Client-Id 与密钥 → 申请本接口 → 写入 .env 的 LYDATA_CLIENT_ID / LYDATA_CLIENT_SECRET'
  }
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function num (v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {string} clientId
 * @param {string} clientSecret
 */
function signHeaders (clientId, clientSecret) {
  const timestamp = String(Date.now())
  const nonce = crypto.randomUUID()
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
    'User-Agent': 'shiyongcha-lydata-bus/1.1'
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {BusVehicle}
 */
export function normalizeBusRow (raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    id: String(r.id ?? r.ID ?? `${r.license_plate_number || ''}-${r.gps_date_time || ''}`),
    plate: String(r.license_plate_number ?? r.plate ?? ''),
    vehicle_id: String(r.vehicle_identification ?? ''),
    line_id: String(r.line_id ?? ''),
    line_version: String(r.line_version ?? ''),
    lat: num(r.gps_latitude ?? r.lat),
    lng: num(r.gps_longitude ?? r.lng),
    speed: num(r.gps_speed ?? r.speed),
    direction: num(r.gps_direction ?? r.direction),
    station_seq: num(r.site_sequence_number ?? r.station_seq),
    entry_exit: String(r.entry_and_exit_status ?? ''),
    up_down: String(r.up_and_down ?? ''),
    status: String(r.operational_status ?? ''),
    gps_time: String(r.gps_date_time ?? ''),
    updated_at: formatPortalTime(r.S_LAST_UPDATETIME ?? r.S_LASTUPDATETIME),
    created_at: formatPortalTime(r.S_CREATETIME)
  }
}

/**
 * 开放网时间：毫秒时间戳或数字字符串
 * @param {unknown} v
 */
function formatPortalTime (v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (Number.isFinite(n) && n > 1e11) {
    try {
      return new Date(n).toISOString()
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/**
 * Haversine km
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 */
export function haversineKm (lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * @param {{ start: number, pageSize: number }} opts
 * @returns {Promise<{ rows: BusVehicle[], rawCount: number, upstream: any }>}
 */
async function fetchBusPage ({ start, pageSize }) {
  const { id, secret } = loadLydataCreds()
  if (!id || !secret) {
    const err = new Error('lydata_creds_missing')
    err.status = 503
    err.code = 'lydata_not_configured'
    throw err
  }

  const url = new URL(GATEWAY)
  url.searchParams.set('STARTNUM', String(start))
  url.searchParams.set('PAGENUM', String(pageSize))

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.LYDATA_TIMEOUT_MS) || 20000)
  let text = ''
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: signHeaders(id, secret),
      signal: ctrl.signal
    })
    text = await res.text()
  } finally {
    clearTimeout(timer)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    const err = new Error('lydata_invalid_json')
    err.status = 502
    err.preview = text.slice(0, 200)
    throw err
  }

  const code = body?.code
  const ok =
    code === 200 ||
    code === '200' ||
    code === 0 ||
    code === '0' ||
    code === '100' ||
    body?.success === true
  if (!ok) {
    const msg = String(body?.msg || body?.message || `upstream_code_${code}`)
    const badId = /请求者标识|令牌|Client|签名|Signature|认证/i.test(msg)
    const err = new Error(msg)
    err.status = badId ? 503 : 502
    err.code = badId ? 'lydata_auth_failed' : 'lydata_upstream'
    err.upstream = body
    throw err
  }

  const list = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.rows)
      ? body.rows
      : Array.isArray(body?.result)
        ? body.result
        : []

  return { rows: list.map(normalizeBusRow), rawCount: list.length, upstream: body }
}

/**
 * @param {{ force?: boolean, maxFetch?: number }} [opts]
 * @returns {Promise<BusVehicle[]>}
 */
export async function fetchBusGpsRaw (opts = {}) {
  const now = Date.now()
  if (!opts.force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.rows
  }

  const pageSize = PAGE_SIZE
  const maxFetch = Math.min(MAX_FETCH, Math.max(pageSize, Number(opts.maxFetch) || MAX_FETCH))
  /** @type {BusVehicle[]} */
  const all = []
  let start = 0
  while (start < maxFetch) {
    const { rows, rawCount } = await fetchBusPage({
      start,
      pageSize: Math.min(pageSize, maxFetch - start)
    })
    all.push(...rows)
    if (rawCount < pageSize) break
    start += rawCount
  }

  cache = { at: Date.now(), rows: all }
  return all
}

/**
 * @param {{
 *   plate?: string,
 *   line?: string,
 *   lat?: number|null,
 *   lng?: number|null,
 *   radius_km?: number,
 *   limit?: number,
 *   force?: boolean
 * }} [q]
 */
export async function queryBusGps (q = {}) {
  const rows = await fetchBusGpsRaw({ force: q.force })
  const plate = String(q.plate || '').trim().toUpperCase()
  const line = String(q.line || '').trim()
  const lat = q.lat == null ? null : Number(q.lat)
  const lng = q.lng == null ? null : Number(q.lng)
  const radius = Math.max(0.2, Number(q.radius_km) || 2)
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 80))

  let list = rows
  if (plate) {
    list = list.filter((r) => r.plate.toUpperCase().includes(plate))
  }
  if (line) {
    list = list.filter((r) => r.line_id.includes(line))
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    list = list
      .map((r) => {
        if (r.lat == null || r.lng == null) return { ...r, distance_km: null }
        return { ...r, distance_km: Math.round(haversineKm(lat, lng, r.lat, r.lng) * 1000) / 1000 }
      })
      .filter((r) => r.distance_km != null && r.distance_km <= radius)
      .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
  }

  return {
    ok: true,
    count: Math.min(list.length, limit),
    total_matched: list.length,
    upstream_count: rows.length,
    cached: Boolean(cache && Date.now() - cache.at < CACHE_TTL_MS),
    items: list.slice(0, limit),
    meta: lydataBusMeta(),
    disclaimer: '公交 GPS 来自临沂市公共数据开放网，仅供出行参考，请以出勤车辆与站点公示为准。'
  }
}
