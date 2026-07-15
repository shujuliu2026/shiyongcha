/**
 * 银行联行号 / 支行编码查询
 * - 优先：data/cnaps-full.jsonl（由 银行支行编码.xlsx 导入，约 15 万条）
 * - 回落：data/cnaps-seed.json
 * - 可选：JUHE_INTERBANK_KEY 第三方全量
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const FULL_PATH = path.join(DATA_DIR, 'cnaps-full.jsonl')
const META_PATH = path.join(DATA_DIR, 'cnaps-full.meta.json')
const SEED_PATH = path.join(DATA_DIR, 'cnaps-seed.json')

/**
 * @typedef {{ c: string, n: string, b: string, bc: string }} CompactRow
 * @typedef {{ cnaps: string, name: string, bank: string, bank_code: string, province?: string, city?: string, address?: string, tel?: string }} CnapsRow
 */

/** @type {{ rows: CompactRow[], byCnaps: Map<string, CompactRow>, banks: string[], loadedAt: string } | null} */
let fullCache = null
/** @type {CnapsRow[] | null} */
let seedCache = null

/**
 * @param {string} s
 */
function norm (s) {
  return String(s || '').trim().toLowerCase()
}

/**
 * 地名匹配：避免「临沂」命中「上海临沂路 / 浦东新区临沂支行」等外地网点
 * @param {string} nameN 已 norm 的支行名
 * @param {string} region 已 norm 的地名
 */
function matchRegionInName (nameN, region) {
  if (!region) return true
  if (!nameN.includes(region)) return false
  if (region === '临沂') {
    // 路名误匹配：外地「临沂路」支行
    const roadOnly = /临沂路/.test(nameN) && !/临沂(市|县|区|分行|支行|办)/.test(nameN)
    if (roadOnly) return false
    // 上海等地用「临沂」作支行名（如浦东新区临沂支行），非山东临沂市
    if (
      /(浦东新区临沂|上海市临沂|上海临沂路)/.test(nameN) ||
      (/(北京|天津|重庆|上海市).{0,24}临沂(路|支行)/.test(nameN) && !/临沂(市|分行)/.test(nameN))
    ) {
      return false
    }
    // 安徽阜阳「临沂商城」市场内网点（名称含临沂但非山东临沂市）
    if (/阜阳/.test(nameN) && /临沂/.test(nameN)) return false
  }
  return true
}

/**
 * 从联行名称推断区县（无门牌地址时的地点核实辅助）
 * @param {string} name
 */
export function inferLinyiDistrict (name) {
  const n = String(name || '')
  if (/兰山区|临沂兰山/.test(n) || (/兰山/.test(n) && /临沂/.test(n))) return '兰山区'
  if (/罗庄/.test(n)) return '罗庄区'
  if (/河东/.test(n)) return '河东区'
  if (/沂南/.test(n)) return '沂南县'
  if (/郯城/.test(n)) return '郯城县'
  if (/沂水/.test(n)) return '沂水县'
  if (/兰陵|苍山/.test(n)) return '兰陵县'
  if (/费县/.test(n)) return '费县'
  if (/平邑/.test(n)) return '平邑县'
  if (/莒南/.test(n)) return '莒南县'
  if (/蒙阴/.test(n)) return '蒙阴县'
  if (/临沭/.test(n)) return '临沭县'
  if (/高新/.test(n)) return '高新区'
  if (/临港/.test(n)) return '临港区'
  if (/经开|经济技术|开发区/.test(n)) return '经开区'
  if (/临沂/.test(n)) return '临沂市'
  return ''
}

function loadMeta () {
  try {
    if (!fs.existsSync(META_PATH)) return null
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'))
  } catch {
    return null
  }
}

function loadFull () {
  if (fullCache) return fullCache
  if (!fs.existsSync(FULL_PATH)) return null
  const t0 = Date.now()
  const text = fs.readFileSync(FULL_PATH, 'utf8')
  const rows = []
  const byCnaps = new Map()
  const bankSet = new Set()
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      /** @type {CompactRow} */
      const row = JSON.parse(line)
      if (!row.c || !row.n) continue
      rows.push(row)
      byCnaps.set(row.c, row)
      if (row.b) bankSet.add(row.b)
    } catch {
      /* skip bad line */
    }
  }
  fullCache = {
    rows,
    byCnaps,
    banks: [...bankSet].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    loadedAt: new Date().toISOString()
  }
  console.log(`[cnaps] full loaded ${rows.length} in ${Date.now() - t0}ms`)
  return fullCache
}

function loadSeed () {
  if (seedCache) return seedCache
  try {
    const list = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
    seedCache = Array.isArray(list) ? list : []
  } catch {
    seedCache = []
  }
  return seedCache
}

/**
 * @param {CompactRow} r
 * @returns {CnapsRow}
 */
function expandCompact (r) {
  const name = r.n
  const district = inferLinyiDistrict(name)
  return {
    cnaps: r.c,
    name,
    bank: r.b || '',
    bank_code: r.bc || '',
    province: /临沂/.test(name) ? '山东' : '',
    city: /临沂/.test(name) && matchRegionInName(norm(name), '临沂') ? '临沂' : '',
    district,
    address: '',
    tel: ''
  }
}

/**
 * @param {object} q
 */
export function searchCnapsFull (q = {}) {
  const full = loadFull()
  if (!full) return null

  const bank = norm(q.bank)
  const province = norm(q.province)
  const city = norm(q.city)
  const keyword = norm(q.keyword)
  const district = String(q.district || '').trim()
  const cnapsQ = String(q.cnaps || q.keyword || '').trim()
  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)
  const offset = Math.max(Number(q.offset) || 0, 0)

  if (!bank && !province && !city && !keyword && !/^\d{8,12}$/.test(cnapsQ)) {
    return {
      source: 'full',
      total: 0,
      matched: 0,
      items: [],
      hint: '请填写银行、关键字，或 12 位联行号',
      corpus: full.rows.length
    }
  }

  // 精确联行号
  if (/^\d{12}$/.test(cnapsQ)) {
    const hit = full.byCnaps.get(cnapsQ)
    const items = hit ? [expandCompact(hit)] : []
    return {
      source: 'full',
      total: items.length,
      matched: items.length,
      items,
      corpus: full.rows.length,
      disclaimer: '数据来自银行支行编码表导入，仅供参考，以银行柜台/网银为准。'
    }
  }

  const regionHint = [province, city].filter(Boolean)
  let skipped = 0
  let pageHasMore = false
  /** @type {CompactRow[]} */
  const itemsCompact = []
  for (const r of full.rows) {
    if (bank && !norm(r.b).includes(bank) && !norm(r.n).includes(bank)) continue
    if (keyword) {
      const blob = `${r.n} ${r.b} ${r.c} ${r.bc}`
      if (!norm(blob).includes(keyword)) continue
    }
    if (regionHint.length) {
      const nameN = norm(r.n)
      if (!regionHint.every((h) => matchRegionInName(nameN, h))) continue
    }
    if (district) {
      const d = inferLinyiDistrict(r.n)
      if (district === '临沂市') {
        if (d !== '临沂市') continue
      } else if (d !== district) {
        continue
      }
    }
    if (skipped < offset) {
      skipped++
      continue
    }
    if (itemsCompact.length >= limit) {
      pageHasMore = true
      break
    }
    itemsCompact.push(r)
  }

  const items = itemsCompact.map(expandCompact)
  return {
    source: 'full',
    total: items.length,
    has_more: pageHasMore,
    offset,
    limit,
    items,
    corpus: full.rows.length,
    location_note:
      city === '临沂' || district
        ? '地点核实：源表无门牌/坐标；区县由支行名称推断。外地「临沂路」「浦东新区临沂支行」已排除。正式地址以柜台/网银/地图为准。'
        : undefined,
    disclaimer: '数据来自《银行支行编码》表导入（联行号/联行名称/总行），仅供参考，以银行柜台/网银为准。'
  }
}

/**
 * @param {object} q
 */
export function searchCnapsSeed (q = {}) {
  const bank = norm(q.bank)
  const province = norm(q.province)
  const city = norm(q.city)
  const keyword = norm(q.keyword)
  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)

  if (!bank && !province && !city && !keyword) {
    return { source: 'seed', total: 0, items: [], hint: '请至少填写银行、省市或关键字之一' }
  }

  const items = loadSeed().filter((row) => {
    if (bank && !norm(row.bank).includes(bank) && !norm(row.name).includes(bank)) return false
    if (province && !norm(row.province).includes(province)) return false
    if (city && !norm(row.city).includes(city) && !norm(row.address).includes(city)) return false
    if (keyword) {
      const blob = `${row.name} ${row.bank} ${row.address} ${row.cnaps}`
      if (!norm(blob).includes(keyword)) return false
    }
    return true
  }).slice(0, limit)

  return {
    source: 'seed',
    total: items.length,
    items: items.map((r) => ({
      cnaps: r.cnaps,
      bank: r.bank,
      name: r.name,
      bank_code: '',
      province: r.province || '',
      city: r.city || '',
      address: r.address || '',
      tel: r.tel || ''
    })),
    disclaimer: '当前为示例子集。请执行 npm run import:cnaps 导入 银行支行编码.xlsx 全量数据。'
  }
}

/**
 * 聚合数据联行号（可选）
 * @param {object} q
 * @param {string} apiKey
 */
export async function searchCnapsJuhe (q, apiKey) {
  const key = String(apiKey || '').trim()
  if (!key) {
    const err = new Error('juhe_key_missing')
    err.status = 503
    throw err
  }

  const url = new URL('https://apis.juhe.cn/interbank/query')
  url.searchParams.set('key', key)
  if (q.bank) url.searchParams.set('bank', String(q.bank))
  if (q.province) url.searchParams.set('province', String(q.province))
  if (q.city) url.searchParams.set('city', String(q.city))
  if (q.keyword) url.searchParams.set('keyword', String(q.keyword))
  url.searchParams.set('page', String(q.page || 1))

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal })
    const body = await res.json().catch(() => ({}))
    if (Number(body.error_code) !== 0) {
      const err = new Error(body.reason || `juhe_${body.error_code}`)
      err.status = 502
      throw err
    }
    const list = Array.isArray(body.result) ? body.result : (body.result?.list || [])
    const items = list.map((r) => ({
      cnaps: String(r.bank_code || r.cnaps || r.lianhanghao || ''),
      bank: String(r.bank || r.bank_name || ''),
      name: String(r.bank_name || r.name || r.lname || ''),
      bank_code: '',
      province: String(r.province || ''),
      city: String(r.city || ''),
      address: String(r.address || ''),
      tel: String(r.tel || r.phone || '')
    })).filter((r) => r.cnaps)

    return {
      source: 'juhe',
      total: items.length,
      items,
      disclaimer: '数据来自第三方接口，仅供参考，以银行柜台/网银为准。'
    }
  } finally {
    clearTimeout(t)
  }
}

/**
 * 解析批量输入行 → 查询条件
 * 支持：12 位联行号；或「银行 关键字」；或纯关键字
 * @param {string} line
 */
export function parseBatchLine (line) {
  const s = String(line || '').trim()
  if (!s) return null
  if (/^\d{12}$/.test(s)) return { keyword: s, cnaps: s }
  const parts = s.split(/[\s,，|；;]+/).filter(Boolean)
  if (parts.length >= 2) {
    return { bank: parts[0], keyword: parts.slice(1).join(' ') }
  }
  return { keyword: s }
}

/**
 * 批量查询（深挖数据价值）
 * @param {string[]} lines
 * @param {{ limitEach?: number }} [opts]
 */
export async function queryCnapsBatch (lines, opts = {}) {
  const limitEach = Math.min(Math.max(Number(opts.limitEach) || 3, 1), 10)
  const input = (Array.isArray(lines) ? lines : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)

  /** @type {Array<{ input: string, ok: boolean, items: any[], error?: string }>} */
  const results = []
  for (const line of input) {
    const q = parseBatchLine(line)
    if (!q) {
      results.push({ input: line, ok: false, items: [], error: 'empty' })
      continue
    }
    const hit = await queryCnaps({ ...q, limit: limitEach })
    results.push({
      input: line,
      ok: (hit.items || []).length > 0,
      items: hit.items || [],
      source: hit.source
    })
  }

  return {
    source: 'batch',
    count: results.length,
    hit_count: results.filter((r) => r.ok).length,
    results,
    disclaimer: '批量结果仅供参考，以银行柜台/网银为准。'
  }
}

/**
 * @param {object} q
 */
export async function queryCnaps (q = {}) {
  const prefer = String(q.source || '').trim()
  const juheKey = process.env.JUHE_INTERBANK_KEY || process.env.JUHE_CNAPS_KEY || ''

  if (prefer !== 'seed' && prefer !== 'juhe') {
    const full = searchCnapsFull(q)
    if (full) return full
  }

  if (juheKey && prefer !== 'seed' && (prefer === 'juhe' || !fs.existsSync(FULL_PATH))) {
    try {
      return await searchCnapsJuhe(q, juheKey)
    } catch (e) {
      if (String(q.fallback) === '0') throw e
      const seed = searchCnapsSeed(q)
      return { ...seed, source: 'seed_fallback', upstream_error: e?.message || String(e) }
    }
  }

  return searchCnapsSeed(q)
}

export function listCnapsBanks () {
  const full = loadFull()
  if (full) return full.banks
  const set = new Set()
  for (const row of loadSeed()) {
    if (row.bank) set.add(row.bank)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function listCnapsMeta () {
  const full = loadFull()
  const meta = loadMeta()
  if (full) {
    return {
      banks: full.banks.slice(0, 800),
      bank_count: full.banks.length,
      provinces: [],
      cities: [],
      seed_count: loadSeed().length,
      full_count: full.rows.length,
      source: 'full',
      imported_at: meta?.imported_at || full.loadedAt,
      juhe_configured: Boolean(process.env.JUHE_INTERBANK_KEY || process.env.JUHE_CNAPS_KEY),
      columns: meta?.columns || ['联行号', '联行名称', '总行银行号', '总行银行名称']
    }
  }
  const provinces = new Set()
  const cities = new Set()
  for (const row of loadSeed()) {
    if (row.province) provinces.add(row.province)
    if (row.city) cities.add(row.city)
  }
  return {
    banks: listCnapsBanks(),
    bank_count: listCnapsBanks().length,
    provinces: [...provinces].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    cities: [...cities].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    seed_count: loadSeed().length,
    full_count: 0,
    source: 'seed',
    juhe_configured: Boolean(process.env.JUHE_INTERBANK_KEY || process.env.JUHE_CNAPS_KEY),
    hint: '尚未导入全量：在项目根放置 银行支行编码.xlsx 后执行 npm run import:cnaps'
  }
}
