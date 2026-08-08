/**
 * 临沂银行网点地理坐标缓存与地理编码
 * 高德 Place Text（推荐：AMAP_WEB_KEY）· Nominatim 回落
 * 缓存：data/linyi-bank-geo.json（按联行号）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gcj02ToWgs84 } from './coord-convert.mjs'
import { inferLinyiDistrict } from './info-bank-cnaps.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = path.resolve(__dirname, '../../data/linyi-bank-geo.json')

/** 区县中心（约值，WGS84）· 无外网编码时的地图回落 */
const DISTRICT_WGS84 = Object.freeze({
  兰山区: [35.051, 118.348],
  罗庄区: [34.997, 118.285],
  河东区: [35.090, 118.403],
  沂南县: [35.550, 118.465],
  郯城县: [34.614, 118.367],
  沂水县: [35.787, 118.628],
  兰陵县: [34.857, 118.071],
  费县: [35.266, 117.977],
  平邑县: [35.486, 117.640],
  莒南县: [35.175, 118.835],
  蒙阴县: [35.710, 117.945],
  临沭县: [34.917, 118.648],
  高新区: [35.078, 118.287],
  经开区: [35.042, 118.407],
  临港区: [35.120, 119.320],
  临沂市: [35.104, 118.356]
})

/**
 * @param {string} name
 * @returns {GeoPoint|null}
 */
function approxFromDistrict (name) {
  const d = inferLinyiDistrict(name) || '临沂市'
  const pair = DISTRICT_WGS84[d] || DISTRICT_WGS84['临沂市']
  return {
    lat: pair[0],
    lng: pair[1],
    address: `${d}（区县中心近似，非门牌）`,
    name_matched: d,
    provider: 'district_approx',
    updated_at: new Date().toISOString()
  }
}

/**
 * @typedef {{
 *   lat: number,
 *   lng: number,
 *   lat_gcj?: number,
 *   lng_gcj?: number,
 *   address?: string,
 *   provider: string,
 *   updated_at: string
 * }} GeoPoint
 */

/** @type {{ version: number, updated_at: string, points: Record<string, GeoPoint> } | null} */
let mem = null

export function amapConfigured () {
  return Boolean(String(process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || '').trim())
}

/** 区县中心近似坐标（WGS84） */
export function approxDistrictPoint (districtOrName) {
  return approxFromDistrict(districtOrName)
}

export function geoMeta () {
  const cache = loadGeoCache()
  return {
    amap_configured: amapConfigured(),
    cache_count: Object.keys(cache.points || {}).length,
    cache_path: 'data/linyi-bank-geo.json',
    setup_hint: amapConfigured()
      ? '已配置高德 Key，可批量/即时地理编码'
      : '配置 AMAP_WEB_KEY 后可精确定位；未配置时可用 Nominatim 粗定位（国外服务，国内可能慢或不准）'
  }
}

function emptyCache () {
  return { version: 1, updated_at: '', points: /** @type {Record<string, GeoPoint>} */ ({}) }
}

export function loadGeoCache () {
  if (mem) return mem
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      mem = emptyCache()
      return mem
    }
    mem = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    if (!mem.points) mem.points = {}
    return mem
  } catch {
    mem = emptyCache()
    return mem
  }
}

export function saveGeoCache () {
  const c = loadGeoCache()
  c.updated_at = new Date().toISOString()
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2), 'utf8')
  return c
}

/**
 * @param {string} cnaps
 * @returns {GeoPoint|null}
 */
export function lookupBankGeo (cnaps) {
  const c = String(cnaps || '').trim()
  if (!c) return null
  return loadGeoCache().points[c] || null
}

/**
 * @param {string} cnaps
 * @param {GeoPoint} point
 */
export function putBankGeo (cnaps, point) {
  const c = String(cnaps || '').trim()
  if (!c) return
  const cache = loadGeoCache()
  cache.points[c] = point
  mem = cache
}

/**
 * @param {string} name
 * @param {string} [city]
 * @param {{ extensions?: 'base'|'all' }} [opts]
 */
export async function geocodeAmap (name, city = '临沂', opts = {}) {
  const key = String(process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || '').trim()
  if (!key) {
    const err = new Error('amap_key_missing')
    err.status = 503
    throw err
  }
  const secret = String(
    process.env.AMAP_WEB_SECRET || process.env.AMAP_SECURITY_KEY || process.env.AMAP_SECRET || ''
  ).trim()

  /** @type {Record<string, string>} */
  const params = {
    key,
    keywords: String(name || '').trim(),
    city: city || '临沂',
    citylimit: 'true',
    offset: '1',
    page: '1',
    extensions: opts.extensions === 'all' ? 'all' : 'base'
  }

  const url = new URL('https://restapi.amap.com/v3/place/text')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  // 开启「数字签名」时需要 sig = md5(按 key 排序拼接 + 私钥)
  if (secret) {
    const { createHash } = await import('crypto')
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    const sig = createHash('md5').update(sorted + secret, 'utf8').digest('hex')
    url.searchParams.set('sig', sig)
  }

  const res = await fetch(url)
  const body = await res.json()
  if (String(body.status) !== '1' || !body.pois?.length) {
    const err = new Error(body.info || body.infocode || 'amap_no_result')
    err.status = String(body.infocode) === '10001' || String(body.infocode) === '10009' ? 401 : 404
    err.upstream = { info: body.info, infocode: body.infocode }
    throw err
  }
  const poi = body.pois[0]
  const [lngStr, latStr] = String(poi.location || '').split(',')
  const lngGcj = Number(lngStr)
  const latGcj = Number(latStr)
  if (!Number.isFinite(lngGcj) || !Number.isFinite(latGcj)) {
    const err = new Error('amap_bad_location')
    err.status = 502
    throw err
  }
  const [lng, lat] = gcj02ToWgs84(lngGcj, latGcj)
  const addrParts = [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean)
  const address =
    String(poi.address || '').trim() ||
    addrParts.join('') ||
    String(poi.name || '').trim()
  const telList = String(poi.tel || poi.phone || '')
    .split(/[;；,，|/]/)
    .map((s) => s.trim())
    .filter((s) => s && !/\*{2,}/.test(s) && !/^\*+$/.test(s))
  const tel = telList[0] || ''

  return {
    lat,
    lng,
    lat_gcj: latGcj,
    lng_gcj: lngGcj,
    address,
    district: String(poi.adname || '').trim(),
    name_matched: String(poi.name || ''),
    tel,
    tels: telList,
    provider: 'amap',
    updated_at: new Date().toISOString()
  }
}

/**
 * 从 POI 多电话中选号。
 * 有脱敏尾号时：必须尾号一致才采纳（避免张冠李戴）。
 * 无脱敏尾号时：取第一个可用号码。
 * @param {string|string[]} tels
 * @param {string} [phoneRaw]
 * @param {{ requireMaskMatch?: boolean }} [opts]
 */
export function pickTelMatchingMask (tels, phoneRaw = '', opts = {}) {
  const list = (Array.isArray(tels) ? tels : String(tels || '').split(/[;；,，|/]/))
    .map((s) => String(s || '').trim())
    .filter((s) => s && !/\*{2,}/.test(s))
  if (!list.length) return ''
  const rawDigits = String(phoneRaw || '').replace(/\D/g, '')
  const last4 = rawDigits.length >= 4 ? rawDigits.slice(-4) : ''
  const requireMask = opts.requireMaskMatch !== false && Boolean(last4)
  if (last4) {
    const hit = list.find((t) => t.replace(/\D/g, '').endsWith(last4))
    if (hit) return hit
    if (requireMask) return ''
  }
  return list[0]
}

/**
 * Nominatim（无 Key 回落，请遵守 use-agent 与速率）
 * @param {string} name
 * @param {string} [city]
 */
export async function geocodeNominatim (name, city = '临沂') {
  const q = `${name} ${city} 山东`
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'cn')
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'shiyongcha-local-bank/0.1 (linyi practical lookup)'
    }
  })
  if (!res.ok) {
    const err = new Error(`nominatim_http_${res.status}`)
    err.status = 502
    throw err
  }
  const list = await res.json()
  if (!Array.isArray(list) || !list.length) {
    const err = new Error('nominatim_no_result')
    err.status = 404
    throw err
  }
  const hit = list[0]
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  return {
    lat,
    lng,
    address: String(hit.display_name || ''),
    name_matched: String(hit.display_name || '').slice(0, 80),
    provider: 'nominatim',
    updated_at: new Date().toISOString()
  }
}

/**
 * @param {{ cnaps: string, name: string, city?: string, force?: boolean }} opts
 */
export async function geocodeBankBranch (opts) {
  const cnaps = String(opts.cnaps || '').trim()
  const name = String(opts.name || '').trim()
  if (!name) {
    const err = new Error('empty_name')
    err.status = 400
    throw err
  }
  if (!opts.force && cnaps) {
    const hit = lookupBankGeo(cnaps)
    if (hit) return { ...hit, cached: true }
  }

  let point
  try {
    if (amapConfigured()) {
      try {
        point = await geocodeAmap(name, opts.city || '临沂')
      } catch (e) {
        if (opts.try_nominatim) {
          try {
            point = await geocodeNominatim(name, opts.city || '临沂')
          } catch {
            point = approxFromDistrict(name)
          }
        } else if (opts.approx !== false) {
          point = approxFromDistrict(name)
        } else {
          throw e
        }
      }
    } else if (opts.try_nominatim) {
      try {
        point = await geocodeNominatim(name, opts.city || '临沂')
      } catch {
        point = approxFromDistrict(name)
      }
    } else if (opts.approx !== false) {
      point = approxFromDistrict(name)
    } else {
      const err = new Error('amap_key_missing')
      err.status = 503
      throw err
    }
  } catch (e) {
    throw e
  }

  if (cnaps) {
    putBankGeo(cnaps, point)
    saveGeoCache()
  }
  return { ...point, cached: false }
}

/**
 * 给查询结果附加坐标
 * @param {Array<Record<string, unknown>>} items
 * @param {{ fill?: number }} [opts] fill>0 时对缺失项即时编码（有上限）
 */
export async function enrichItemsWithGeo (items, opts = {}) {
  const list = Array.isArray(items) ? items : []
  const fill = Math.min(20, Math.max(0, Number(opts.fill) || 0))
  let filled = 0
  const out = []
  for (const raw of list) {
    const item = { ...raw }
    const cnaps = String(item.cnaps || '')
    let geo = lookupBankGeo(cnaps)
    if (!geo && fill > filled && item.name) {
      try {
        geo = await geocodeBankBranch({
          cnaps,
          name: String(item.name),
          city: '临沂'
        })
        filled++
        // Nominatim 限速
        if (geo.provider === 'nominatim') {
          await new Promise((r) => setTimeout(r, 1100))
        }
      } catch {
        geo = null
      }
    }
    if (geo) {
      item.lat = geo.lat
      item.lng = geo.lng
      item.geo_address = geo.address || ''
      item.geo_provider = geo.provider
    }
    out.push(item)
  }
  return { items: out, geo_filled: filled, geo_meta: geoMeta() }
}
