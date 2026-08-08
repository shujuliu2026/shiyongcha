/**
 * 综合查询 · 数据更新留痕
 * - 更新前快照：data/ops/versions/<sourceId>/<runId>/before.json
 * - 变更明细：同目录 changes.json
 * - 运行索引：data/ops/data-refresh-log.jsonl（后台列表）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { touchDataSource, DEFAULT_DATA_SOURCES } from './data-sources.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OPS_DIR = path.join(ROOT, 'data/ops')
const LOG_FILE = path.join(OPS_DIR, 'data-refresh-log.jsonl')
const VERSIONS_DIR = path.join(OPS_DIR, 'versions')
const SCHEDULE_FILE = path.join(OPS_DIR, 'refresh-schedule.json')

const MAX_CHANGES_IN_LOG = 80
const MAX_FIELD_CHARS = 200
const MAX_LOG_LINES_SCAN = 5000

/** 默认定时约定（可被 data/ops/refresh-schedule.json 覆盖） */
export const DEFAULT_REFRESH_SCHEDULE = Object.freeze([
  {
    source_id: 'hukou-windows-json',
    cron_hint: '0 3 * * 1',
    interval_days: 7,
    npm_script: 'import:hukou',
    note: '每周一 03:00 · 户籍窗口电话（需原始资料有新表）'
  },
  {
    source_id: 'ss-card-outlets-json',
    cron_hint: '0 3 1 * *',
    interval_days: 30,
    npm_script: 'writeback:ss-card',
    note: '每月 1 日 03:00 · 社保卡制卡网点写回/补电话'
  },
  {
    source_id: 'training-orgs-json',
    cron_hint: '0 4 1 * *',
    interval_days: 30,
    npm_script: 'update:training-orgs',
    note: '每月 1 日 04:00 · 职业培训机构'
  },
  {
    source_id: 'bus-ic-outlets-json',
    cron_hint: '0 2 15 * *',
    interval_days: 30,
    npm_script: 'import:bus-ic',
    note: '每月 15 日 02:00 · 公交 IC 办理网点'
  }
])

function ensureOps () {
  fs.mkdirSync(OPS_DIR, { recursive: true })
  fs.mkdirSync(VERSIONS_DIR, { recursive: true })
}

function nowIso () {
  return new Date().toISOString()
}

function runId () {
  const d = new Date()
  const stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-')
  return `${stamp}_${Math.random().toString(36).slice(2, 7)}`
}

function absPath (relOrAbs) {
  if (!relOrAbs) return ''
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs)
}

function relFromRoot (abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

function readJsonSafe (fp, fallback = null) {
  try {
    if (!fs.existsSync(fp)) return fallback
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch {
    return fallback
  }
}

function clip (v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s == null) return ''
  return s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}…` : s
}

/**
 * @param {unknown} data
 * @returns {Array<Record<string, unknown>>}
 */
export function extractItems (data) {
  if (!data || typeof data !== 'object') return []
  const o = /** @type {Record<string, unknown>} */ (data)
  if (Array.isArray(o.items)) return o.items.filter((x) => x && typeof x === 'object')
  if (Array.isArray(o.windows)) return o.windows.filter((x) => x && typeof x === 'object')
  if (Array.isArray(o.list)) return o.list.filter((x) => x && typeof x === 'object')
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === 'object')
  return []
}

/**
 * @param {Record<string, unknown>} item
 * @param {number} idx
 */
export function itemKey (item, idx = 0) {
  const id = item.id ?? item.code ?? item.cnaps ?? item.tel
  if (id != null && String(id).trim()) return String(id).trim()
  const name = item.name ?? item.title ?? item.网点名称
  if (name != null && String(name).trim()) return `name:${String(name).trim()}`
  return `idx:${idx}`
}

/**
 * @param {unknown} before
 * @param {unknown} after
 */
export function diffLocalData (before, after) {
  const aItems = extractItems(before)
  const bItems = extractItems(after)
  /** @type {Map<string, Record<string, unknown>>} */
  const aMap = new Map()
  aItems.forEach((it, i) => aMap.set(itemKey(it, i), it))
  /** @type {Map<string, Record<string, unknown>>} */
  const bMap = new Map()
  bItems.forEach((it, i) => bMap.set(itemKey(it, i), it))

  /** @type {Array<Record<string, unknown>>} */
  const changes = []
  let added = 0
  let removed = 0
  let changed = 0
  let unchanged = 0

  for (const [key, b] of bMap) {
    if (!aMap.has(key)) {
      added++
      changes.push({
        op: 'add',
        key,
        after: summarizeItem(b)
      })
      continue
    }
    const a = aMap.get(key)
    const fields = changedFields(a, b)
    if (fields.length) {
      changed++
      changes.push({
        op: 'change',
        key,
        fields,
        before: pickFields(a, fields),
        after: pickFields(b, fields)
      })
    } else {
      unchanged++
    }
  }
  for (const [key, a] of aMap) {
    if (!bMap.has(key)) {
      removed++
      changes.push({
        op: 'remove',
        key,
        before: summarizeItem(a)
      })
    }
  }

  const metaKeys = ['updated', 'updated_at', 'enriched_at', 'count', 'masked_phone_count', 'disclaimer', 'enrich_hint']
  /** @type {string[]} */
  const meta_changed = []
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const k of metaKeys) {
      const bv = /** @type {any} */ (before)[k]
      const av = /** @type {any} */ (after)[k]
      if (JSON.stringify(bv) !== JSON.stringify(av)) meta_changed.push(k)
    }
  }

  return {
    summary: {
      before_count: aItems.length,
      after_count: bItems.length,
      added,
      removed,
      changed,
      unchanged,
      meta_changed
    },
    changes
  }
}

function summarizeItem (item) {
  const keys = ['id', 'name', 'title', 'bank', 'phone', 'tel', 'address', 'district']
  /** @type {Record<string, string>} */
  const out = {}
  for (const k of keys) {
    if (item[k] != null && String(item[k]).trim()) out[k] = clip(item[k])
  }
  if (!Object.keys(out).length) out._ = clip(item)
  return out
}

function changedFields (a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  /** @type {string[]} */
  const fields = []
  for (const k of keys) {
    if (k.startsWith('_')) continue
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) fields.push(k)
  }
  return fields.slice(0, 40)
}

function pickFields (item, fields) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const k of fields) out[k] = clip(item?.[k])
  return out
}

function sourceFilePath (sourceId) {
  const base = DEFAULT_DATA_SOURCES.find((s) => s.id === sourceId)
  return base?.file_path || null
}

/**
 * 更新前快照
 * @param {{ sourceId: string, filePath?: string, trigger?: string, note?: string }} opts
 */
export function beginDataRefresh (opts) {
  ensureOps()
  const sourceId = String(opts.sourceId || '').trim()
  if (!sourceId) {
    const err = new Error('source_id_required')
    err.status = 400
    throw err
  }
  const fileRel = opts.filePath || sourceFilePath(sourceId)
  if (!fileRel) {
    const err = new Error('file_path_missing')
    err.status = 400
    throw err
  }
  const fileAbs = absPath(fileRel)
  const id = runId()
  const dir = path.join(VERSIONS_DIR, sourceId, id)
  fs.mkdirSync(dir, { recursive: true })
  const snapshotAbs = path.join(dir, 'before.json')
  let before = null
  if (fs.existsSync(fileAbs)) {
    fs.copyFileSync(fileAbs, snapshotAbs)
    before = readJsonSafe(snapshotAbs, null)
  } else {
    fs.writeFileSync(snapshotAbs, 'null', 'utf8')
  }
  const started_at = nowIso()
  const meta = {
    run_id: id,
    source_id: sourceId,
    started_at,
    trigger: String(opts.trigger || 'cli').slice(0, 40),
    note: String(opts.note || '').slice(0, 300),
    file_path: relFromRoot(fileAbs),
    snapshot_path: relFromRoot(snapshotAbs),
    status: 'started'
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  return { ...meta, dir: relFromRoot(dir), before }
}

/**
 * 更新后对比落盘 + 写日志 + touch 数据源
 * @param {{
 *   runId: string,
 *   sourceId: string,
 *   filePath?: string,
 *   status?: 'ok'|'error'|'noop',
 *   note?: string,
 *   error?: string,
 *   touch?: boolean
 * }} opts
 */
export function finishDataRefresh (opts) {
  ensureOps()
  const sourceId = String(opts.sourceId || '').trim()
  const id = String(opts.runId || '').trim()
  if (!sourceId || !id) {
    const err = new Error('run_id_and_source_required')
    err.status = 400
    throw err
  }
  const dir = path.join(VERSIONS_DIR, sourceId, id)
  const metaPath = path.join(dir, 'meta.json')
  const meta = readJsonSafe(metaPath, null) || {
    run_id: id,
    source_id: sourceId,
    started_at: nowIso(),
    trigger: 'cli',
    file_path: opts.filePath || sourceFilePath(sourceId) || '',
    snapshot_path: relFromRoot(path.join(dir, 'before.json'))
  }
  const fileAbs = absPath(opts.filePath || meta.file_path || sourceFilePath(sourceId) || '')
  const before = readJsonSafe(path.join(dir, 'before.json'), null)
  const after = fileAbs && fs.existsSync(fileAbs) ? readJsonSafe(fileAbs, null) : null
  const { summary, changes } = diffLocalData(before, after)

  const status =
    opts.status ||
    (opts.error ? 'error' : summary.added + summary.removed + summary.changed + summary.meta_changed.length ? 'ok' : 'noop')

  fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify({ summary, changes }, null, 2), 'utf8')
  if (after != null) {
    fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify(after, null, 2), 'utf8')
  }

  const finished_at = nowIso()
  const preview = changes.slice(0, MAX_CHANGES_IN_LOG)
  const record = {
    run_id: id,
    source_id: sourceId,
    source_title: DEFAULT_DATA_SOURCES.find((s) => s.id === sourceId)?.title || sourceId,
    started_at: meta.started_at,
    finished_at,
    trigger: meta.trigger || 'cli',
    status,
    note: String(opts.note || meta.note || '').slice(0, 300),
    error: opts.error ? String(opts.error).slice(0, 500) : '',
    file_path: relFromRoot(fileAbs || absPath(meta.file_path || '')),
    snapshot_path: meta.snapshot_path,
    changes_path: relFromRoot(path.join(dir, 'changes.json')),
    summary,
    changes_preview: preview,
    changes_total: changes.length,
    changes_truncated: changes.length > MAX_CHANGES_IN_LOG
  }

  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, ...record }, null, 2), 'utf8')
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(record)}\n`, 'utf8')

  if (opts.touch !== false && status !== 'error') {
    const note =
      record.note ||
      `更新 ${summary.added}增/${summary.removed}删/${summary.changed}改 · run ${id}`
    try {
      touchDataSource(sourceId, note)
    } catch {
      /* 源未登记时忽略 */
    }
  }

  return record
}

/**
 * 一次性包装：快照 → 执行 fn → 对比
 * @param {{ sourceId: string, filePath?: string, trigger?: string, note?: string, touch?: boolean }} opts
 * @param {() => Promise<unknown>|unknown} fn
 */
export async function withDataRefresh (opts, fn) {
  const began = beginDataRefresh(opts)
  try {
    await fn()
    return finishDataRefresh({
      runId: began.run_id,
      sourceId: opts.sourceId,
      filePath: opts.filePath || began.file_path,
      note: opts.note,
      touch: opts.touch
    })
  } catch (e) {
    return finishDataRefresh({
      runId: began.run_id,
      sourceId: opts.sourceId,
      filePath: opts.filePath || began.file_path,
      status: 'error',
      note: opts.note,
      error: e?.message || String(e),
      touch: false
    })
  }
}

/**
 * @param {{ source_id?: string, limit?: number, status?: string }} [opts]
 */
export function listDataRefreshRuns (opts = {}) {
  ensureOps()
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50))
  const sourceFilter = String(opts.source_id || '').trim()
  const statusFilter = String(opts.status || '').trim()
  if (!fs.existsSync(LOG_FILE)) {
    return { items: [], count: 0, log_path: relFromRoot(LOG_FILE) }
  }
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
  const slice = lines.slice(-MAX_LOG_LINES_SCAN)
  /** @type {any[]} */
  const items = []
  for (let i = slice.length - 1; i >= 0 && items.length < limit; i--) {
    try {
      const row = JSON.parse(slice[i])
      if (sourceFilter && row.source_id !== sourceFilter) continue
      if (statusFilter && row.status !== statusFilter) continue
      items.push({
        run_id: row.run_id,
        source_id: row.source_id,
        source_title: row.source_title || row.source_id,
        started_at: row.started_at,
        finished_at: row.finished_at,
        trigger: row.trigger,
        status: row.status,
        note: row.note || '',
        summary: row.summary || null,
        changes_total: row.changes_total ?? (row.changes_preview || []).length,
        file_path: row.file_path || ''
      })
    } catch {
      /* skip bad line */
    }
  }
  return { items, count: items.length, log_path: relFromRoot(LOG_FILE) }
}

/**
 * @param {string} runId
 * @param {string} [sourceId]
 */
export function getDataRefreshRun (runId, sourceId = '') {
  ensureOps()
  const id = String(runId || '').trim()
  if (!id) {
    const err = new Error('run_id_required')
    err.status = 400
    throw err
  }

  // 优先从 versions 目录读完整明细
  const sources = sourceId
    ? [sourceId]
    : fs.existsSync(VERSIONS_DIR)
      ? fs.readdirSync(VERSIONS_DIR).filter((n) => fs.statSync(path.join(VERSIONS_DIR, n)).isDirectory())
      : []

  for (const sid of sources) {
    const dir = path.join(VERSIONS_DIR, sid, id)
    if (!fs.existsSync(dir)) continue
    const meta = readJsonSafe(path.join(dir, 'meta.json'), null)
    const changesDoc = readJsonSafe(path.join(dir, 'changes.json'), { summary: null, changes: [] })
    return {
      run: meta,
      summary: changesDoc.summary || meta?.summary || null,
      changes: Array.isArray(changesDoc.changes) ? changesDoc.changes : [],
      snapshot_path: meta?.snapshot_path || relFromRoot(path.join(dir, 'before.json')),
      changes_path: relFromRoot(path.join(dir, 'changes.json')),
      has_after: fs.existsSync(path.join(dir, 'after.json'))
    }
  }

  // 回落日志行
  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const row = JSON.parse(lines[i])
        if (row.run_id === id && (!sourceId || row.source_id === sourceId)) {
          return {
            run: row,
            summary: row.summary || null,
            changes: row.changes_preview || [],
            snapshot_path: row.snapshot_path || '',
            changes_path: row.changes_path || '',
            has_after: false,
            from_log_only: true
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  const err = new Error('refresh_run_not_found')
  err.status = 404
  throw err
}

export function listRefreshSchedule () {
  ensureOps()
  const ov = readJsonSafe(SCHEDULE_FILE, null)
  const items = Array.isArray(ov?.items) ? ov.items : [...DEFAULT_REFRESH_SCHEDULE]
  const lastBySource = {}
  const runs = listDataRefreshRuns({ limit: 200 }).items
  for (const r of runs) {
    if (!lastBySource[r.source_id] && r.status !== 'error') {
      lastBySource[r.source_id] = r.finished_at || r.started_at
    }
  }
  return {
    items: items.map((it) => {
      const last = lastBySource[it.source_id] || null
      let due = true
      if (last && it.interval_days) {
        const ms = Number(it.interval_days) * 86400000
        due = Date.now() - new Date(last).getTime() >= ms
      }
      return {
        ...it,
        source_title: DEFAULT_DATA_SOURCES.find((s) => s.id === it.source_id)?.title || it.source_id,
        last_refresh_at: last,
        due
      }
    }),
    schedule_path: relFromRoot(SCHEDULE_FILE),
    convention:
      '约定：Windows 任务计划每小时执行 npm run refresh:due；到期任务按 npm_script 更新，并自动快照原文 + 写变更明细。也可手动 npm run refresh:record -- --source <id> -- <命令>。'
  }
}

/**
 * 最近一次成功更新时间（供数据源列表展示）
 * @param {string} sourceId
 */
export function lastRefreshAt (sourceId) {
  const hit = listDataRefreshRuns({ source_id: sourceId, limit: 1 }).items[0]
  return hit?.finished_at || hit?.started_at || null
}

/**
 * 同步生成：对本地 JSON 数据源立刻打快照并写留痕（内容未改则为 noop）
 * 供后台「同步生成」按钮 / CLI 初始化统计用
 * @param {{ note?: string, sourceIds?: string[] }} [opts]
 */
export function syncGenerateLocalSources (opts = {}) {
  ensureOps()
  const note = String(opts.note || '同步生成基线').slice(0, 300)
  const allow = Array.isArray(opts.sourceIds) && opts.sourceIds.length
    ? new Set(opts.sourceIds.map(String))
    : null

  const targets = DEFAULT_DATA_SOURCES.filter((s) => {
    if (allow && !allow.has(s.id)) return false
    const fp = s.file_path
    if (!fp || !String(fp).endsWith('.json')) return false
    return fs.existsSync(absPath(fp))
  })

  /** @type {Array<Record<string, unknown>>} */
  const items = []
  for (const s of targets) {
    try {
      const began = beginDataRefresh({
        sourceId: s.id,
        filePath: s.file_path,
        trigger: 'sync',
        note
      })
      const rec = finishDataRefresh({
        runId: began.run_id,
        sourceId: s.id,
        filePath: began.file_path,
        note,
        touch: true
      })
      items.push({
        source_id: s.id,
        source_title: s.title,
        run_id: rec.run_id,
        status: rec.status,
        summary: rec.summary
      })
    } catch (e) {
      items.push({
        source_id: s.id,
        source_title: s.title,
        status: 'error',
        error: e?.message || String(e)
      })
    }
  }

  return {
    generated_at: nowIso(),
    count: items.length,
    ok: items.filter((x) => x.status === 'ok' || x.status === 'noop').length,
    error: items.filter((x) => x.status === 'error').length,
    items
  }
}
