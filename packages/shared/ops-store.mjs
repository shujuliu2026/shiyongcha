/**
 * 运营台 · 工具目录 / 公告 / 反馈（JSON 落盘，无 DB）
 * data/ops/catalog.json
 * data/ops/notices.json
 * data/ops/feedback.jsonl
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_TOOLS, defaultToolsById } from './tools-catalog.mjs'
import { LOCAL_CATEGORIES, NATIONAL_CATEGORIES } from './tool-categories.mjs'
import { analyticsSummary, todayShanghai } from './analytics-store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(__dirname, '../../data/ops')
const CATALOG_FILE = path.join(DIR, 'catalog.json')
const NOTICES_FILE = path.join(DIR, 'notices.json')
const FEEDBACK_FILE = path.join(DIR, 'feedback.jsonl')

const LEVELS = new Set(['info', 'warn', 'urgent'])
const FEEDBACK_TYPES = new Set(['bug', 'suggest', 'content', 'other'])
const FEEDBACK_STATUS = new Set(['new', 'read', 'done', 'spam'])
const MAX_NOTICES = 30
const MAX_FEEDBACK_BODY = 1000
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 8

/** @type {Map<string, number[]>} */
const feedbackRate = new Map()

function ensureDir () {
  fs.mkdirSync(DIR, { recursive: true })
}

function readJson (fp, fallback) {
  try {
    if (!fs.existsSync(fp)) return fallback
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson (fp, obj) {
  ensureDir()
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), 'utf8')
}

function nowIso () {
  return new Date().toISOString()
}

function uuid () {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ——— catalog ———

function readCatalogOverrides () {
  const raw = readJson(CATALOG_FILE, { tools: [], updated_at: null })
  const tools = Array.isArray(raw.tools) ? raw.tools : []
  /** @type {Map<string, { enabled?: boolean, sort?: number, title?: string, desc?: string }>} */
  const map = new Map()
  for (const row of tools) {
    if (!row || typeof row !== 'object') continue
    const id = String(/** @type {{ id?: string }} */ (row).id || '').trim()
    if (!id) continue
    map.set(id, /** @type {any} */ (row))
  }
  return { map, updated_at: raw.updated_at || null }
}

/**
 * 合并默认目录与运营覆盖
 * @param {{ all?: boolean }} [opts] all=true 含停用项（后台）
 */
export function listCatalog (opts = {}) {
  const { map, updated_at } = readCatalogOverrides()
  const merged = DEFAULT_TOOLS.map((base) => {
    const ov = map.get(base.id) || {}
    const enabled = ov.enabled === undefined ? base.enabled : Boolean(ov.enabled)
    const sort = Number.isFinite(Number(ov.sort)) ? Number(ov.sort) : base.sort
    return {
      ...base,
      enabled,
      sort,
      title: typeof ov.title === 'string' && ov.title.trim() ? ov.title.trim().slice(0, 40) : base.title,
      desc: typeof ov.desc === 'string' && ov.desc.trim() ? ov.desc.trim().slice(0, 120) : base.desc
    }
  }).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'zh'))

  const tools = opts.all ? merged : merged.filter((t) => t.enabled)
  const local = tools.filter((t) => t.group === 'local')
  const national = tools.filter((t) => t.group === 'national')
  return {
    tools,
    local,
    national,
    categories: {
      local: LOCAL_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        hint: c.hint || '',
        sort: c.sort
      })),
      national: NATIONAL_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        hint: c.hint || '',
        sort: c.sort
      }))
    },
    updated_at,
    defaults_count: DEFAULT_TOOLS.length
  }
}

/**
 * @param {unknown} input
 */
export function saveCatalog (input) {
  if (!input || typeof input !== 'object') {
    const err = new Error('invalid_catalog')
    err.status = 400
    throw err
  }
  const rows = Array.isArray(/** @type {any} */ (input).tools)
    ? /** @type {any} */ (input).tools
    : null
  if (!rows) {
    const err = new Error('tools_required')
    err.status = 400
    throw err
  }

  const known = defaultToolsById()
  /** @type {{ id: string, enabled: boolean, sort: number, title?: string, desc?: string }[]} */
  const tools = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.id || '').trim()
    if (!known.has(id)) continue
    const base = known.get(id)
    const item = {
      id,
      enabled: row.enabled === undefined ? base.enabled : Boolean(row.enabled),
      sort: Number.isFinite(Number(row.sort)) ? Math.max(0, Math.min(9999, Number(row.sort))) : base.sort
    }
    if (typeof row.title === 'string' && row.title.trim() && row.title.trim() !== base.title) {
      item.title = row.title.trim().slice(0, 40)
    }
    if (typeof row.desc === 'string' && row.desc.trim() && row.desc.trim() !== base.desc) {
      item.desc = row.desc.trim().slice(0, 120)
    }
    tools.push(item)
  }

  const payload = { tools, updated_at: nowIso() }
  writeJson(CATALOG_FILE, payload)
  return listCatalog({ all: true })
}

export function moveCatalogItem (id, direction) {
  const cat = listCatalog({ all: true })
  const idx = cat.tools.findIndex((t) => t.id === id)
  if (idx < 0) {
    const err = new Error('tool_not_found')
    err.status = 404
    throw err
  }
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= cat.tools.length) return cat
  const a = cat.tools[idx]
  const b = cat.tools[swap]
  const sortA = a.sort
  a.sort = b.sort
  b.sort = sortA
  // 若 sort 相同，强制拉开
  if (a.sort === b.sort) {
    if (direction === 'up') a.sort = Math.max(0, b.sort - 1)
    else a.sort = b.sort + 1
  }
  return saveCatalog({ tools: cat.tools })
}

// ——— notices ———

function readNoticesDoc () {
  return readJson(NOTICES_FILE, { notices: [], updated_at: null })
}

function normalizeNotice (raw, { partial = false } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const n = /** @type {Record<string, unknown>} */ (raw)
  const id = String(n.id || uuid()).trim().slice(0, 64)
  const title = String(n.title || '').trim().slice(0, 80)
  const body = String(n.body || '').trim().slice(0, 500)
  if (!partial && (!title || !body)) return null
  const level = LEVELS.has(String(n.level || 'info')) ? String(n.level || 'info') : 'info'
  const enabled = n.enabled === undefined ? true : Boolean(n.enabled)
  const link_url = n.link_url ? String(n.link_url).trim().slice(0, 300) : ''
  if (link_url && !/^https?:\/\//i.test(link_url) && !link_url.startsWith('/')) {
    const err = new Error('invalid_link_url')
    err.status = 400
    throw err
  }
  const link_label = String(n.link_label || '').trim().slice(0, 40)
  const published_at = n.published_at ? String(n.published_at) : nowIso()
  const expires_at = n.expires_at ? String(n.expires_at) : ''
  return {
    id,
    title: title || '公告',
    body: body || '',
    level,
    enabled,
    link_url,
    link_label: link_label || (link_url ? '查看' : ''),
    published_at,
    expires_at,
    updated_at: nowIso()
  }
}

function isNoticeActive (n, now = Date.now()) {
  if (!n?.enabled) return false
  if (n.expires_at) {
    const t = Date.parse(n.expires_at)
    if (!Number.isNaN(t) && t < now) return false
  }
  if (n.published_at) {
    const t = Date.parse(n.published_at)
    if (!Number.isNaN(t) && t > now) return false
  }
  return true
}

/**
 * @param {{ all?: boolean }} [opts]
 */
export function listNotices (opts = {}) {
  const doc = readNoticesDoc()
  const notices = (Array.isArray(doc.notices) ? doc.notices : [])
    .filter((n) => n && typeof n === 'object')
    .map((n) => ({ ...n }))
  notices.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))
  const now = Date.now()
  const items = opts.all ? notices : notices.filter((n) => isNoticeActive(n, now))
  return {
    notices: items,
    updated_at: doc.updated_at || null,
    active_count: notices.filter((n) => isNoticeActive(n, now)).length,
    total: notices.length
  }
}

/**
 * @param {unknown} input 全量覆盖或 { notice } 单条 upsert
 */
export function saveNotices (input) {
  if (!input || typeof input !== 'object') {
    const err = new Error('invalid_notices')
    err.status = 400
    throw err
  }
  const body = /** @type {Record<string, unknown>} */ (input)

  if (body.notice && typeof body.notice === 'object') {
    const doc = readNoticesDoc()
    const list = Array.isArray(doc.notices) ? [...doc.notices] : []
    const next = normalizeNotice(body.notice)
    if (!next || !next.title || !next.body) {
      const err = new Error('title_body_required')
      err.status = 400
      throw err
    }
    const idx = list.findIndex((x) => x && x.id === next.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...next }
    else list.unshift(next)
    const payload = { notices: list.slice(0, MAX_NOTICES), updated_at: nowIso() }
    writeJson(NOTICES_FILE, payload)
    return listNotices({ all: true })
  }

  const rows = Array.isArray(body.notices) ? body.notices : null
  if (!rows) {
    const err = new Error('notices_required')
    err.status = 400
    throw err
  }
  const notices = []
  for (const row of rows.slice(0, MAX_NOTICES)) {
    const n = normalizeNotice(row)
    if (n && n.title && n.body) notices.push(n)
  }
  writeJson(NOTICES_FILE, { notices, updated_at: nowIso() })
  return listNotices({ all: true })
}

export function deleteNotice (id) {
  const sid = String(id || '').trim()
  const doc = readNoticesDoc()
  const list = (Array.isArray(doc.notices) ? doc.notices : []).filter((n) => n?.id !== sid)
  writeJson(NOTICES_FILE, { notices: list, updated_at: nowIso() })
  return listNotices({ all: true })
}

// ——— feedback ———

function checkFeedbackRate (ip) {
  const key = String(ip || 'unknown').slice(0, 64)
  const now = Date.now()
  const arr = (feedbackRate.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_MAX) {
    const err = new Error('rate_limited')
    err.status = 429
    throw err
  }
  arr.push(now)
  feedbackRate.set(key, arr)
}

/**
 * @param {unknown} raw
 * @param {{ ip?: string }} [meta]
 */
export function submitFeedback (raw, meta = {}) {
  checkFeedbackRate(meta.ip || 'unknown')
  if (!raw || typeof raw !== 'object') {
    const err = new Error('invalid_feedback')
    err.status = 400
    throw err
  }
  const f = /** @type {Record<string, unknown>} */ (raw)
  const content = String(f.content || f.body || '').trim()
  if (content.length < 4) {
    const err = new Error('content_too_short')
    err.status = 400
    throw err
  }
  if (content.length > MAX_FEEDBACK_BODY) {
    const err = new Error('content_too_long')
    err.status = 400
    throw err
  }
  const type = FEEDBACK_TYPES.has(String(f.type || 'suggest'))
    ? String(f.type || 'suggest')
    : 'suggest'
  const item = {
    id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    contact: String(f.contact || '').trim().slice(0, 80),
    page: String(f.page || '').trim().slice(0, 120),
    status: 'new',
    created_at: nowIso(),
    ip: String(meta.ip || '').slice(0, 64)
  }
  ensureDir()
  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(item) + '\n', 'utf8')
  return { ok: true, id: item.id }
}

/**
 * @param {{ status?: string, limit?: number }} [opts]
 */
export function listFeedback (opts = {}) {
  ensureDir()
  if (!fs.existsSync(FEEDBACK_FILE)) {
    return { items: [], counts: { new: 0, read: 0, done: 0, spam: 0, total: 0 } }
  }
  const lines = fs.readFileSync(FEEDBACK_FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
  /** @type {any[]} */
  const items = []
  for (const line of lines) {
    try {
      items.push(JSON.parse(line))
    } catch {
      /* skip */
    }
  }
  items.reverse()
  const status = opts.status ? String(opts.status) : ''
  let filtered = status ? items.filter((x) => x.status === status) : items
  const limit = Math.max(1, Math.min(200, Number(opts.limit) || 50))
  filtered = filtered.slice(0, limit)

  const counts = { new: 0, read: 0, done: 0, spam: 0, total: items.length }
  for (const x of items) {
    const s = FEEDBACK_STATUS.has(x.status) ? x.status : 'new'
    counts[s] = (counts[s] || 0) + 1
  }
  return { items: filtered, counts }
}

/**
 * @param {string} id
 * @param {string} status
 */
export function updateFeedbackStatus (id, status) {
  const sid = String(id || '').trim()
  const st = String(status || '').trim()
  if (!FEEDBACK_STATUS.has(st)) {
    const err = new Error('invalid_status')
    err.status = 400
    throw err
  }
  if (!fs.existsSync(FEEDBACK_FILE)) {
    const err = new Error('not_found')
    err.status = 404
    throw err
  }
  const lines = fs.readFileSync(FEEDBACK_FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
  let found = false
  const out = lines.map((line) => {
    try {
      const row = JSON.parse(line)
      if (row.id === sid) {
        found = true
        return JSON.stringify({ ...row, status: st, updated_at: nowIso() })
      }
    } catch {
      /* keep */
    }
    return line
  })
  if (!found) {
    const err = new Error('not_found')
    err.status = 404
    throw err
  }
  ensureDir()
  fs.writeFileSync(FEEDBACK_FILE, out.join('\n') + '\n', 'utf8')
  return { ok: true, id: sid, status: st }
}

/**
 * 运营概览 KPI（常规运营看板）
 * @param {'today'|'7d'|'30d'} [range]
 */
export function opsOverview (range = 'today') {
  const analytics = analyticsSummary(range)
  const feedback = listFeedback({ limit: 5 })
  const notices = listNotices({ all: true })
  const catalog = listCatalog({ all: true })
  const day = todayShanghai()
  const feedbackToday = feedback.items.filter((x) => String(x.created_at || '').startsWith(day)).length
  // jsonl 全量再数今日（list 已截断时不准确）— 轻量重扫尾部
  let newOpen = feedback.counts.new || 0

  return {
    range,
    today: day,
    traffic: {
      pv: analytics.pv,
      uv: analytics.uv,
      top_paths: (analytics.top_paths || []).slice(0, 8),
      by_device: analytics.by_device || [],
      series: analytics.series || []
    },
    catalog: {
      total: catalog.tools.length,
      enabled: catalog.tools.filter((t) => t.enabled).length,
      disabled: catalog.tools.filter((t) => !t.enabled).length,
      updated_at: catalog.updated_at
    },
    notices: {
      active: notices.active_count,
      total: notices.total,
      updated_at: notices.updated_at
    },
    feedback: {
      new: newOpen,
      total: feedback.counts.total,
      today_sample: feedbackToday,
      recent: feedback.items.slice(0, 5)
    },
    generated_at: nowIso()
  }
}
