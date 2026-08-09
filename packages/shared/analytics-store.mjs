/**
 * 访问统计 · JSONL 落盘 + 日汇总
 * data/analytics/events-YYYY-MM-DD.jsonl
 * data/analytics/daily.json  { "2026-07-14": { pv, visitors:{}, paths:{} } }
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(__dirname, '../../data/analytics')
const DAILY = path.join(DIR, 'daily.json')

const ALLOWED_HOOKS = new Set([
  'page.view',
  'tool.click',
  'search.query',
  'page.share',
  'suite_card_impression',
  'suite_card_click',
  'btn.click',
  'link.click',
  'dial',
  'copy',
  'filter',
  'submit',
  'nav.click',
  'feedback'
])
const MAX_BATCH = 40
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 120

/** @type {Map<string, number[]>} */
const rateBuckets = new Map()

export function todayShanghai (d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(d)
}

function ensureDir () {
  fs.mkdirSync(DIR, { recursive: true })
}

function readDaily () {
  try {
    if (!fs.existsSync(DAILY)) return {}
    return JSON.parse(fs.readFileSync(DAILY, 'utf8'))
  } catch {
    return {}
  }
}

function writeDaily (obj) {
  ensureDir()
  fs.writeFileSync(DAILY, JSON.stringify(obj), 'utf8')
}

/**
 * @param {string} ip
 */
export function checkAnalyticsRate (ip) {
  const key = String(ip || 'unknown').slice(0, 64)
  const now = Date.now()
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_MAX) {
    const err = new Error('rate_limited')
    err.status = 429
    throw err
  }
  arr.push(now)
  rateBuckets.set(key, arr)
}

/**
 * @param {unknown} raw
 */
function normalizeEvent (raw) {
  if (!raw || typeof raw !== 'object') return null
  const e = /** @type {Record<string, unknown>} */ (raw)
  const hook = String(e.feature_hook || e.hook || '').trim()
  if (!ALLOWED_HOOKS.has(hook)) return null
  const pathName = String(e.path || '/').slice(0, 200)
  const visitor = String(e.visitor_id || 'anon').slice(0, 64)
  const session = String(e.session_id || '').slice(0, 64)
  const title = String(e.title || e.payload?.title || '').slice(0, 120)
  const channel = String(e.client_channel || 'h5').slice(0, 32)
  const device = String(e.device_type || 'unknown').slice(0, 32)
  const referrer = String(e.referrer || '').slice(0, 300)
  const occurred = String(e.occurred_at || new Date().toISOString()).slice(0, 40)
  return {
    feature_hook: hook,
    path: pathName.startsWith('/') ? pathName : `/${pathName}`,
    visitor_id: visitor,
    session_id: session,
    title,
    client_channel: channel,
    device_type: device,
    referrer,
    occurred_at: occurred
  }
}

/**
 * @param {unknown[]} events
 * @param {{ ip?: string }} [meta]
 */
export function ingestAnalyticsEvents (events, meta = {}) {
  checkAnalyticsRate(meta.ip || 'unknown')
  const list = Array.isArray(events) ? events : []
  if (!list.length) return { accepted: 0 }
  const normalized = []
  for (const raw of list.slice(0, MAX_BATCH)) {
    const n = normalizeEvent(raw)
    if (n) normalized.push(n)
  }
  if (!normalized.length) return { accepted: 0 }

  ensureDir()
  const day = todayShanghai()
  const jsonl = path.join(DIR, `events-${day}.jsonl`)
  const lines = normalized.map((e) => JSON.stringify(e)).join('\n') + '\n'
  fs.appendFileSync(jsonl, lines, 'utf8')

  const daily = readDaily()
  if (!daily[day]) daily[day] = { pv: 0, visitors: {}, paths: {}, devices: {}, channels: {} }
  const bucket = daily[day]
  if (!bucket.devices) bucket.devices = {}
  if (!bucket.channels) bucket.channels = {}
  for (const e of normalized) {
    if (e.feature_hook !== 'page.view') continue
    bucket.pv = Number(bucket.pv || 0) + 1
    bucket.visitors[e.visitor_id] = (bucket.visitors[e.visitor_id] || 0) + 1
    const p = e.path
    if (!bucket.paths[p]) bucket.paths[p] = { pv: 0, title: e.title || p }
    bucket.paths[p].pv += 1
    if (e.title) bucket.paths[p].title = e.title
    const device = e.device_type || 'unknown'
    bucket.devices[device] = Number(bucket.devices[device] || 0) + 1
    const channel = e.client_channel || 'h5'
    bucket.channels[channel] = Number(bucket.channels[channel] || 0) + 1
  }
  writeDaily(daily)
  return { accepted: normalized.length, day }
}

/**
 * @param {'today'|'7d'|'30d'} range
 */
export function analyticsSummary (range = 'today') {
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1
  const daily = readDaily()
  const keys = []
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000)
    keys.push(todayShanghai(d))
  }

  let pv = 0
  /** @type {Set<string>} */
  const visitors = new Set()
  /** @type {Record<string, { pv: number, title: string }>} */
  const paths = {}
  /** @type {Record<string, number>} */
  const devices = {}
  /** @type {Record<string, number>} */
  const channels = {}
  /** @type {{ day: string, pv: number, uv: number }[]} */
  const series = []

  for (const day of keys) {
    const b = daily[day]
    const dayPv = Number(b?.pv || 0)
    const dayUv = b?.visitors ? Object.keys(b.visitors).length : 0
    series.push({ day, pv: dayPv, uv: dayUv })
    if (!b) continue
    pv += dayPv
    for (const v of Object.keys(b.visitors || {})) visitors.add(v)
    for (const [p, info] of Object.entries(b.paths || {})) {
      if (!paths[p]) paths[p] = { pv: 0, title: info.title || p }
      paths[p].pv += Number(info.pv || 0)
      if (info.title) paths[p].title = info.title
    }
    for (const [k, n] of Object.entries(b.devices || {})) {
      devices[k] = Number(devices[k] || 0) + Number(n || 0)
    }
    for (const [k, n] of Object.entries(b.channels || {})) {
      channels[k] = Number(channels[k] || 0) + Number(n || 0)
    }
  }

  const top_paths = Object.entries(paths)
    .map(([pathName, info]) => ({ path: pathName, title: info.title, pv: info.pv }))
    .sort((a, b) => b.pv - a.pv)
    .slice(0, 30)

  const by_device = Object.entries(devices)
    .map(([name, count]) => ({ name, pv: count }))
    .sort((a, b) => b.pv - a.pv)

  const by_channel = Object.entries(channels)
    .map(([name, count]) => ({ name, pv: count }))
    .sort((a, b) => b.pv - a.pv)

  return {
    range,
    days: keys.length,
    pv,
    uv: visitors.size,
    top_paths,
    by_device,
    by_channel,
    series: series.reverse(),
    today: todayShanghai(),
    generated_at: new Date().toISOString()
  }
}

/**
 * 最近事件（今日 jsonl 末尾）
 * @param {number} limit
 */
export function analyticsRecent (limit = 40) {
  const day = todayShanghai()
  const jsonl = path.join(DIR, `events-${day}.jsonl`)
  if (!fs.existsSync(jsonl)) return { day, items: [] }
  const raw = fs.readFileSync(jsonl, 'utf8').trim()
  if (!raw) return { day, items: [] }
  const lines = raw.split(/\r?\n/)
  const slice = lines.slice(-Math.max(1, Math.min(100, limit)))
  const items = []
  for (const line of slice.reverse()) {
    try {
      items.push(JSON.parse(line))
    } catch {
      /* skip */
    }
  }
  return { day, items }
}
