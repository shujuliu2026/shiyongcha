/**
 * 实用查 · 轻量 API 服务
 * 端口默认 5180
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  DEFAULT_WATCH,
  fetchRainRadarFrames,
  fetchTyphoonActivity,
  fetchTyphoonDetail,
  toNum
} from '../../../packages/shared/weather-radar-core.mjs'
import { listCnapsMeta, queryCnaps, queryCnapsBatch } from '../../../packages/shared/info-bank-cnaps.mjs'
import { getHolidayYear, isWorkday } from '../../../packages/shared/holidays.mjs'
import { fetchEarthquakeEew, fetchEarthquakeList } from '../../../packages/shared/earthquake-core.mjs'
import { lookupIdRegion } from '../../../packages/shared/id-region.mjs'
import { fetchAirQuality } from '../../../packages/shared/air-quality.mjs'
import {
  listEnvMeta,
  queryAirQuality as querySdAirQuality,
  queryPrecip as querySdPrecip
} from '../../../packages/shared/sd-open-env.mjs'
import { listPriceMeta, queryAgriPrice } from '../../../packages/shared/agri-price.mjs'
import {
  listDataSources,
  patchDataSource,
  touchDataSource
} from '../../../packages/shared/data-sources.mjs'
import { APP_CONFIG } from '../../../packages/shared/config.mjs'
import { LICENSE_PLANS, LICENSE_PRICE_COPY, getSupportConfig } from '../../../packages/shared/license-config.mjs'
import {
  activateLicense,
  consumeLicense,
  publicLicense,
  requireLicenseByToken
} from '../../../packages/shared/license-store.mjs'
import { checkAndConsumeFreeSingle } from '../../../packages/shared/free-quota.mjs'
import { lydataBusMeta, queryBusGps } from '../../../packages/shared/lydata-bus.mjs'
import {
  ingestAnalyticsEvents,
  analyticsSummary,
  analyticsRecent
} from '../../../packages/shared/analytics-store.mjs'
import {
  listCatalog,
  saveCatalog,
  moveCatalogItem,
  listNotices,
  saveNotices,
  deleteNotice,
  submitFeedback,
  listFeedback,
  updateFeedbackStatus,
  opsOverview
} from '../../../packages/shared/ops-store.mjs'
import { emitFeedbackToHub } from '../../../packages/shared/hub-feedback.mjs'
import { getHistoryToday } from '../../../packages/shared/history-today.mjs'
import {
  enrichItemsWithGeo,
  geoMeta,
  geocodeBankBranch,
  loadGeoCache
} from '../../../packages/shared/linyi-bank-geo.mjs'
import { enrichPlaceItem, placeEnrichMeta } from '../../../packages/shared/place-enrich.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const DATA_LOCAL = path.join(ROOT, 'data/local')
const DATA_NATIONAL = path.join(ROOT, 'data/national')

/** 粗粒度加载根目录 .env（无 dotenv 依赖；支持顶部两行裸 ClientId/Secret） */
function loadRootEnv () {
  try {
    const envPath = path.join(ROOT, '.env')
    if (!fs.existsSync(envPath)) return
    /** @type {string[]} */
    const bareHex = []
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const i = s.indexOf('=')
      if (i <= 0) {
        if (/^[a-f0-9]{16,}$/i.test(s)) bareHex.push(s)
        continue
      }
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
    // 通用令牌：前两行裸 hex → 填入未显式配置的 SD_OPEN / LYDATA
    if (bareHex[0]) {
      if (process.env.SD_OPEN_CLIENT_ID === undefined) process.env.SD_OPEN_CLIENT_ID = bareHex[0]
      if (process.env.LYDATA_CLIENT_ID === undefined) process.env.LYDATA_CLIENT_ID = bareHex[0]
    }
    if (bareHex[1]) {
      if (process.env.SD_OPEN_CLIENT_SECRET === undefined) process.env.SD_OPEN_CLIENT_SECRET = bareHex[1]
      if (process.env.LYDATA_CLIENT_SECRET === undefined) process.env.LYDATA_CLIENT_SECRET = bareHex[1]
    }
  } catch {
    /* ignore */
  }
}
loadRootEnv()

const port = Number(process.env.PORT || process.env.API_PORT || 5180)
const BUILD_ID = process.env.BUILD_ID || 'dev'

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string[]} origins
 */
function applyCors (req, res, origins) {
  const origin = String(req.headers.origin || '')
  const allow = origins.includes('*') || origins.includes(origin)
  if (allow && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-License-Token, X-Admin-Token')
}

function adminError (e) {
  return {
    status: e?.status || 401,
    body: {
      error: e?.message || 'forbidden',
      message:
        e?.message === 'admin_not_configured'
          ? '未配置 ADMIN_TOKEN，请在 .env 写入后重启 API'
          : e?.message === 'unauthorized'
            ? '令牌错误'
            : e?.message
    }
  }
}

/**
 * @param {import('http').IncomingMessage} req
 */
function readBody (req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('http').IncomingMessage} req
 */
function clientIp (req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || req.socket?.remoteAddress || 'unknown'
}

/**
 * @param {import('http').IncomingMessage} req
 */
function licenseTokenFrom (req) {
  return String(req.headers['x-license-token'] || '').trim()
}

/**
 * @param {import('http').IncomingMessage} req
 */
function requireAdmin (req) {
  const expected = String(process.env.ADMIN_TOKEN || '').trim()
  if (!expected) {
    const err = new Error('admin_not_configured')
    err.status = 503
    throw err
  }
  const got = String(req.headers['x-admin-token'] || '').trim()
  if (!got || got !== expected) {
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function sendJson (res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(JSON.stringify(body))
}

/**
 * @param {string} city
 * @param {string} file
 */
function loadLocalJson (city, file) {
  const id = String(city || APP_CONFIG.defaultCity.id).toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const fp = path.join(DATA_LOCAL, id, file)
  if (!fs.existsSync(fp)) {
    const err = new Error('city_not_found')
    err.status = 404
    throw err
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'))
}

/**
 * @param {import('url').URL} url
 * @param {import('http').IncomingMessage} req
 * @param {Record<string, unknown>} body
 */
async function handleRequest (url, req, body = {}) {
  const pathname = url.pathname
  const method = req.method || 'GET'

  if (pathname === '/health' || pathname === '/api/v1/health') {
    return {
      status: 200,
      body: { ok: true, service: 'shiyongcha-api', build: BUILD_ID, city: APP_CONFIG.defaultCity }
    }
  }

  if (pathname === '/api/v1/config') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
      body: APP_CONFIG
    }
  }

  // --- weather ---
  if (pathname === '/api/v1/weather/typhoon/activity') {
    try {
      const body = await fetchTyphoonActivity({
        watchLat: toNum(url.searchParams.get('lat')) ?? DEFAULT_WATCH.lat,
        watchLng: toNum(url.searchParams.get('lng')) ?? DEFAULT_WATCH.lng,
        alertKm: toNum(url.searchParams.get('alert_km')) ?? DEFAULT_WATCH.alertKm
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=120' }, body }
    } catch (e) {
      return {
        status: e?.status === 400 ? 400 : 502,
        body: { error: 'typhoon_upstream_failed', message: e?.message || String(e) }
      }
    }
  }

  const detailMatch = /^\/api\/v1\/weather\/typhoon\/([^/]+)$/.exec(pathname)
  if (detailMatch) {
    const tfid = decodeURIComponent(detailMatch[1])
    if (tfid === 'activity') return null
    try {
      const body = await fetchTyphoonDetail(tfid)
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=120' }, body }
    } catch (e) {
      const status = e?.status === 400 ? 400 : 502
      return {
        status,
        body: { error: status === 400 ? 'invalid_tfid' : 'typhoon_upstream_failed', message: e?.message || String(e) }
      }
    }
  }

  if (pathname === '/api/v1/weather/radar/frames') {
    try {
      const body = await fetchRainRadarFrames()
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=60' }, body }
    } catch (e) {
      return { status: 502, body: { error: 'radar_upstream_failed', message: e?.message || String(e) } }
    }
  }

  if (pathname === '/api/v1/weather/aqi') {
    try {
      const body = await fetchAirQuality({
        lat: toNum(url.searchParams.get('lat')) ?? DEFAULT_WATCH.lat,
        lng: toNum(url.searchParams.get('lng')) ?? DEFAULT_WATCH.lng,
        label: url.searchParams.get('label') || DEFAULT_WATCH.label
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=300' }, body }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: { error: 'aqi_upstream_failed', message: e?.message || String(e) }
      }
    }
  }

  // --- 山东公共数据开放网 · 空气 / 降水 ---
  if (pathname === '/api/v1/env/meta') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
      body: listEnvMeta()
    }
  }

  if (pathname === '/api/v1/env/air') {
    try {
      const body = await querySdAirQuality({
        city: url.searchParams.get('city') || APP_CONFIG.defaultCity?.name || '临沂',
        start: url.searchParams.get('start') || '0',
        limit: url.searchParams.get('limit') || '40'
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=120' }, body }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.code || 'sd_air_failed',
          message: e?.message || String(e),
          upstream: e?.upstream
        }
      }
    }
  }

  if (pathname === '/api/v1/env/precip') {
    try {
      const body = await querySdPrecip({
        city: url.searchParams.get('city') || APP_CONFIG.defaultCity?.name || '临沂',
        page: url.searchParams.get('page') || '1',
        limit: url.searchParams.get('limit') || '40'
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=120' }, body }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.code || 'sd_precip_failed',
          message: e?.message || String(e),
          upstream: e?.upstream
        }
      }
    }
  }

  // --- 菜蛋肉价 · 商务预报批发监测 ---
  if (pathname === '/api/v1/info/price/meta') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
      body: listPriceMeta()
    }
  }

  if (pathname === '/api/v1/info/price/query') {
    try {
      const body = await queryAgriPrice({
        category: url.searchParams.get('category') || '',
        product: url.searchParams.get('product') || '',
        province: url.searchParams.get('province') || '',
        city: url.searchParams.get('city') || '',
        keyword: url.searchParams.get('keyword') || '',
        limit: url.searchParams.get('limit') || '40'
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=120' }, body }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.code || 'price_query_failed',
          message: e?.message || String(e)
        }
      }
    }
  }

  // --- license / 商业化 ---
  if (method === 'GET' && pathname === '/api/v1/license/plans') {
    const support = getSupportConfig()
    return {
      status: 200,
      body: {
        plans: Object.values(LICENSE_PLANS).map((p) => ({
          ...p,
          price_copy: LICENSE_PRICE_COPY[p.id] || ''
        })),
        support
      }
    }
  }

  if (method === 'POST' && pathname === '/api/v1/license/activate') {
    try {
      const pub = activateLicense(String(body.code || ''))
      return { status: 200, body: { ok: true, license: pub } }
    } catch (e) {
      return {
        status: e?.status || 400,
        body: { error: e?.message || 'activate_failed' }
      }
    }
  }

  if (method === 'GET' && pathname === '/api/v1/license/status') {
    try {
      const token = url.searchParams.get('token') || licenseTokenFrom(req)
      const rec = requireLicenseByToken(token)
      return { status: 200, body: { ok: true, license: publicLicense(rec) } }
    } catch (e) {
      return {
        status: e?.status || 401,
        body: { error: e?.message || 'invalid_token', license: e?.license || null }
      }
    }
  }

  // --- bank ---
  if (method === 'GET' && pathname === '/api/v1/info/bank/meta') {
    const support = getSupportConfig()
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=60' },
      body: {
        ...listCnapsMeta(),
        support,
        plans: Object.values(LICENSE_PLANS).map((p) => ({
          ...p,
          price_copy: LICENSE_PRICE_COPY[p.id] || ''
        }))
      }
    }
  }

  if (method === 'GET' && pathname === '/api/v1/info/bank/cnaps') {
    try {
      // 有许可证则不扣免费额度；否则走免费日限额
      const token = licenseTokenFrom(req)
      let free = null
      if (token) {
        requireLicenseByToken(token)
      } else {
        free = checkAndConsumeFreeSingle(clientIp(req))
      }
      const payload = await queryCnaps({
        bank: url.searchParams.get('bank') || '',
        province: url.searchParams.get('province') || '',
        city: url.searchParams.get('city') || '',
        district: url.searchParams.get('district') || '',
        keyword: url.searchParams.get('keyword') || '',
        page: url.searchParams.get('page') || '1',
        source: url.searchParams.get('source') || '',
        fallback: url.searchParams.get('fallback') || '1',
        limit: url.searchParams.get('limit') || '40'
      })
      // 本地临沂：附加地图坐标（缓存；可选即时补点）
      const geoFill = url.searchParams.get('geo_fill')
      const wantGeo =
        url.searchParams.get('geo') !== '0' &&
        (String(url.searchParams.get('city') || '') === '临沂' ||
          Boolean(url.searchParams.get('district')))
      let body = { ...payload, free_quota: free, geo: geoMeta() }
      if (wantGeo && Array.isArray(payload.items)) {
        const fill = geoFill === '1' ? 8 : geoFill === '0' ? 0 : 0
        const enriched = await enrichItemsWithGeo(payload.items, { fill })
        body = {
          ...body,
          items: enriched.items,
          geo_filled: enriched.geo_filled,
          geo: enriched.geo_meta
        }
      }
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body
      }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.message || 'bank_query_failed',
          message: e?.message === 'free_daily_limit'
            ? '今日免费单条查询次数已用完，请激活或明日再试；批量查询需激活码'
            : e?.message,
          quota: e?.quota || null
        }
      }
    }
  }

  if (method === 'POST' && pathname === '/api/v1/info/bank/cnaps/batch') {
    try {
      const conf = getSupportConfig()
      const token = licenseTokenFrom(req) || String(body.token || '')
      const rec = requireLicenseByToken(token)
      const lines = Array.isArray(body.lines)
        ? body.lines
        : String(body.text || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      if (!lines.length) {
        return { status: 400, body: { error: 'empty_batch', message: '请粘贴至少一行查询内容' } }
      }
      if (lines.length > conf.batch_max_lines) {
        return {
          status: 400,
          body: {
            error: 'batch_too_large',
            message: `单次最多 ${conf.batch_max_lines} 行，请拆分`
          }
        }
      }
      // 按次：每行扣 1 次；包月/包季不扣次
      const licenseAfter = consumeLicense(rec, lines.length)
      const payload = await queryCnapsBatch(lines, {
        limitEach: toNum(body.limit_each) ?? 3
      })
      return {
        status: 200,
        body: {
          ...payload,
          license: licenseAfter
        }
      }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.message || 'batch_failed',
          message:
            e?.message === 'license_required' || e?.message === 'invalid_token'
              ? '批量查询需要激活码，请添加客服微信索取'
              : e?.message === 'exhausted' || e?.message === 'quota_exceeded'
                ? '次数已用尽，请联系客服续费或更换套餐'
                : e?.message === 'expired'
                  ? '套餐已过期，请联系客服续费'
                  : e?.message,
          license: e?.license || null
        }
      }
    }
  }

  // --- public catalog / notices / feedback ---
  if (method === 'GET' && pathname === '/api/v1/catalog') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=30' },
      body: listCatalog({ all: false })
    }
  }

  if (method === 'GET' && pathname === '/api/v1/notices') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=30' },
      body: listNotices({ all: false })
    }
  }

  if (method === 'POST' && pathname === '/api/v1/feedback') {
    try {
      const ip = clientIp(req)
      const result = submitFeedback(body, { ip })
      // 本地落盘成功后双写 OPS 统一收件箱（失败不影响用户成功）
      try {
        const f = body && typeof body === 'object' ? body : {}
        emitFeedbackToHub({
          id: result.id,
          type: String(f.type || 'suggest'),
          content: String(f.content || f.body || ''),
          contact: String(f.contact || ''),
          page: String(f.page || ''),
          item: String(f.item || ''),
          ip
        })
      } catch {
        /* ignore hub emit */
      }
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: result }
    } catch (e) {
      return {
        status: e?.status || 400,
        body: {
          error: e?.message || 'feedback_failed',
          message:
            e?.message === 'content_too_short'
              ? '请至少填写 4 个字'
              : e?.message === 'rate_limited'
                ? '提交过快，请稍后再试'
                : e?.message
        }
      }
    }
  }

  // --- analytics ---
  if (method === 'POST' && pathname === '/api/v1/analytics/events') {
    try {
      const events = Array.isArray(body.events) ? body.events : []
      const result = ingestAnalyticsEvents(events, { ip: clientIp(req) })
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: { ok: true, ...result } }
    } catch (e) {
      return {
        status: e?.status || 400,
        body: { error: e?.message || 'ingest_failed' }
      }
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/ops/overview') {
    try {
      requireAdmin(req)
      const range = url.searchParams.get('range') || 'today'
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: opsOverview(/** @type {'today'|'7d'|'30d'} */ (range))
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/analytics/summary') {
    try {
      requireAdmin(req)
      const range = url.searchParams.get('range') || 'today'
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: analyticsSummary(/** @type {'today'|'7d'|'30d'} */ (range))
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/analytics/recent') {
    try {
      requireAdmin(req)
      const limit = toNum(url.searchParams.get('limit')) ?? 40
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: analyticsRecent(limit)
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/catalog') {
    try {
      requireAdmin(req)
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: listCatalog({ all: true }) }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/sources') {
    try {
      requireAdmin(req)
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: listDataSources({
          mode: url.searchParams.get('mode') || '',
          q: url.searchParams.get('q') || ''
        })
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'POST' && /^\/api\/v1\/admin\/sources\/[^/]+\/touch$/.test(pathname)) {
    try {
      requireAdmin(req)
      const id = decodeURIComponent(pathname.split('/')[5])
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: touchDataSource(id, String(body.note || ''))
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'PATCH' && pathname.startsWith('/api/v1/admin/sources/')) {
    try {
      requireAdmin(req)
      const id = decodeURIComponent(pathname.slice('/api/v1/admin/sources/'.length))
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: patchDataSource(id, body || {})
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'PUT' && pathname === '/api/v1/admin/catalog') {
    try {
      requireAdmin(req)
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: saveCatalog(body) }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'POST' && pathname === '/api/v1/admin/catalog/move') {
    try {
      requireAdmin(req)
      const id = String(body.id || '')
      const direction = body.direction === 'up' ? 'up' : 'down'
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: moveCatalogItem(id, direction)
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/notices') {
    try {
      requireAdmin(req)
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: listNotices({ all: true }) }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'PUT' && pathname === '/api/v1/admin/notices') {
    try {
      requireAdmin(req)
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: saveNotices(body) }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'DELETE' && pathname.startsWith('/api/v1/admin/notices/')) {
    try {
      requireAdmin(req)
      const id = decodeURIComponent(pathname.slice('/api/v1/admin/notices/'.length))
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: deleteNotice(id) }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/admin/feedback') {
    try {
      requireAdmin(req)
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: listFeedback({
          status: url.searchParams.get('status') || '',
          limit: toNum(url.searchParams.get('limit')) ?? 50
        })
      }
    } catch (e) {
      return adminError(e)
    }
  }

  if (method === 'PATCH' && pathname.startsWith('/api/v1/admin/feedback/')) {
    try {
      requireAdmin(req)
      const id = decodeURIComponent(pathname.slice('/api/v1/admin/feedback/'.length))
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: updateFeedbackStatus(id, String(body.status || ''))
      }
    } catch (e) {
      return adminError(e)
    }
  }

  // --- local bank map geo ---
  if (method === 'GET' && pathname === '/api/v1/local/bank/geo/status') {
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: { ok: true, ...geoMeta() } }
  }

  if (method === 'GET' && pathname === '/api/v1/local/bank/geo/points') {
    const cache = loadGeoCache()
    const points = Object.entries(cache.points).map(([cnaps, g]) => ({
      cnaps,
      lat: g.lat,
      lng: g.lng,
      address: g.address || '',
      provider: g.provider
    }))
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=60' },
      body: { ok: true, count: points.length, points, ...geoMeta() }
    }
  }

  if (method === 'POST' && pathname === '/api/v1/local/bank/geo/geocode') {
    try {
      const point = await geocodeBankBranch({
        cnaps: String(body.cnaps || ''),
        name: String(body.name || ''),
        city: String(body.city || '临沂'),
        force: body.force === true || body.force === '1'
      })
      return { status: 200, body: { ok: true, ...point, geo: geoMeta() } }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.message || 'geocode_failed',
          message:
            e?.message === 'amap_key_missing'
              ? '未配置 AMAP_WEB_KEY，将尝试 Nominatim；建议申请高德 Web 服务 Key'
              : e?.message,
          geo: geoMeta()
        }
      }
    }
  }

  // --- local bus GPS (临沂开放网) ---
  if (method === 'GET' && pathname === '/api/v1/local/bus/status') {
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: { ok: true, ...lydataBusMeta() }
    }
  }

  if (method === 'GET' && pathname === '/api/v1/local/bus/gps') {
    try {
      const body = await queryBusGps({
        plate: url.searchParams.get('plate') || '',
        line: url.searchParams.get('line') || '',
        lat: toNum(url.searchParams.get('lat')),
        lng: toNum(url.searchParams.get('lng')),
        radius_km: toNum(url.searchParams.get('radius_km')) ?? 2,
        limit: toNum(url.searchParams.get('limit')) ?? 80,
        force: url.searchParams.get('force') === '1'
      })
      return { status: 200, headers: { 'Cache-Control': 'no-store' }, body }
    } catch (e) {
      const status = e?.status || 502
      return {
        status,
        body: {
          error: e?.code || e?.message || 'bus_gps_failed',
          message:
            e?.code === 'lydata_not_configured' || e?.message === 'lydata_creds_missing'
              ? '未配置开放网令牌：请写入 LYDATA_CLIENT_ID + LYDATA_CLIENT_SECRET（或已授权的 SD_OPEN_CLIENT_*）后重启 API'
              : e?.code === 'lydata_auth_failed' || e?.code === 'lydata_client_id_invalid'
                ? [
                    `开放网拒绝（${e?.message || 'auth_failed'}）。`,
                    '注意：详情页「在线接口调用」走简单认证/登录会话，应用代码走签名令牌（Client-Id+Secret）。',
                    '请到用户中心确认「我的申请」里本接口已绑定当前签名令牌，且状态为已通过；可与页面返回样例核对车牌字段。'
                  ].join('')
                : e?.message || String(e),
          meta: lydataBusMeta(),
          upstream: e?.upstream || undefined
        }
      }
    }
  }

  // --- local ---
  if (pathname === '/api/v1/local/history-today') {
    try {
      const body = getHistoryToday({
        city: url.searchParams.get('city') || APP_CONFIG.defaultCity.id,
        date: url.searchParams.get('date') || ''
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=300' }, body }
    } catch (e) {
      return {
        status: e?.status || 500,
        body: { error: 'history_failed', message: e?.message || String(e) }
      }
    }
  }

  if (method === 'GET' && pathname === '/api/v1/local/enrich-place/meta') {
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: placeEnrichMeta() }
  }

  if (method === 'POST' && pathname === '/api/v1/local/enrich-place') {
    try {
      const bodyIn = await readBody(req)
      const result = await enrichPlaceItem({
        kind: bodyIn.kind || url.searchParams.get('kind') || '',
        id: bodyIn.id || url.searchParams.get('id') || '',
        name: bodyIn.name || url.searchParams.get('name') || '',
        force: Boolean(bodyIn.force),
        allowNominatim: bodyIn.allowNominatim !== false
      })
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: {
          ok: true,
          reused: result.reused,
          item: result.item,
          meta: result.meta
        }
      }
    } catch (e) {
      return {
        status: e?.status || 502,
        body: {
          error: e?.code || e?.message || 'enrich_failed',
          message:
            e?.message === 'amap_key_missing'
              ? '未配置 AMAP_WEB_KEY，已尝试 Nominatim 或请配置高德后再试'
              : e?.message || String(e)
        }
      }
    }
  }

  const localRoutes = {
    '/api/v1/local/hotlines': 'hotlines.json',
    '/api/v1/local/districts': 'districts.json',
    '/api/v1/local/guides': 'guides.json',
    '/api/v1/local/transit': 'transit.json',
    '/api/v1/local/hospitals': 'hospitals.json',
    '/api/v1/local/bus-ic': 'bus-ic-outlets.json',
    '/api/v1/local/bus-shelters': 'bus-shelters.json',
    '/api/v1/local/social-regions': 'social-regions.json',
    '/api/v1/local/freight-stations': 'freight-stations.json',
    '/api/v1/local/training-orgs': 'training-orgs.json',
    '/api/v1/local/ss-card': 'ss-card-outlets.json',
    '/api/v1/local/passenger-stations': 'passenger-stations.json',
    '/api/v1/local/driving-schools': 'driving-schools.json',
    '/api/v1/local/skill-subsidy': 'skill-subsidy-offices.json',
    '/api/v1/local/edu-bases': 'edu-bases.json',
    '/api/v1/local/agri-prod': 'agri-production.json',
    '/api/v1/local/open-data-inventory': 'open-data-inventory.json',
    '/api/v1/local/old-photos': 'old-photos.json',
    '/api/v1/local/hukou-windows': 'hukou-windows.json'
  }
  if (localRoutes[pathname]) {
    try {
      const city = url.searchParams.get('city') || APP_CONFIG.defaultCity.id
      const body = loadLocalJson(city, localRoutes[pathname])
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=600' }, body }
    } catch (e) {
      return { status: e?.status || 500, body: { error: 'local_data_failed', message: e?.message || String(e) } }
    }
  }

  // --- earthquake ---
  if (pathname === '/api/v1/national/earthquake/list') {
    try {
      const body = await fetchEarthquakeList({
        watchLat: toNum(url.searchParams.get('lat')) ?? DEFAULT_WATCH.lat,
        watchLng: toNum(url.searchParams.get('lng')) ?? DEFAULT_WATCH.lng,
        watchLabel: url.searchParams.get('label') || DEFAULT_WATCH.label,
        minMag: toNum(url.searchParams.get('min_mag')) ?? 0,
        limit: toNum(url.searchParams.get('limit')) ?? 50,
        nearOnly: url.searchParams.get('near') === '1'
      })
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=60' }, body }
    } catch (e) {
      return {
        status: 502,
        body: { error: 'earthquake_upstream_failed', message: e?.message || String(e) }
      }
    }
  }

  if (pathname === '/api/v1/national/earthquake/eew') {
    try {
      const body = await fetchEarthquakeEew()
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=15' }, body }
    } catch (e) {
      return {
        status: 502,
        body: { error: 'eew_upstream_failed', message: e?.message || String(e) }
      }
    }
  }

  if (pathname === '/api/v1/national/id-region') {
    const q = url.searchParams.get('q') || url.searchParams.get('id') || ''
    const body = lookupIdRegion(q)
    if (body.error) {
      return { status: 400, body: { error: 'bad_query', message: body.error } }
    }
    return { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' }, body }
  }

  if (pathname === '/api/v1/national/oil') {
    try {
      const fp = path.join(DATA_NATIONAL, 'oil-prices.json')
      const body = JSON.parse(fs.readFileSync(fp, 'utf8'))
      return { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' }, body }
    } catch (e) {
      return { status: 500, body: { error: 'oil_data_failed', message: e?.message || String(e) } }
    }
  }

  // --- national holidays ---
  if (pathname === '/api/v1/national/holidays') {
    const year = url.searchParams.get('year') || '2026'
    const date = url.searchParams.get('date') || ''
    const body = getHolidayYear(year)
    if (date) {
      const wd = isWorkday(date)
      return {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
        body: { ...body, is_workday: wd }
      }
    }
    return { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' }, body }
  }

  if (pathname === '/api/v1/national/is-workday') {
    const date = url.searchParams.get('date') || ''
    const wd = isWorkday(date)
    if (!wd) {
      return { status: 400, body: { error: 'invalid_date_or_year', date } }
    }
    return { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' }, body: wd }
  }

  return null
}

const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean)

const server = http.createServer(async (req, res) => {
  applyCors(req, res, corsOrigins.length ? corsOrigins : ['*'])
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  try {
    const body =
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH' ||
      req.method === 'DELETE'
        ? await readBody(req).catch(() => ({}))
        : {}
    const result = await handleRequest(url, req, body)
    if (!result) {
      return sendJson(res, 404, { error: 'not_found', path: url.pathname })
    }
    sendJson(res, result.status, result.body, result.headers)
  } catch (e) {
    sendJson(res, 500, { error: 'internal_error', message: e?.message || String(e) })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[shiyongcha-api] http://127.0.0.1:${port} · default city ${APP_CONFIG.defaultCity.name}`)
})
