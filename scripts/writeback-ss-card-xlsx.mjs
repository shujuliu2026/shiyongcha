/**
 * 将已补全的社保卡网点信息写回 原始资料/社保/*.xlsx，并刷新查询 JSON
 *
 * 1) 备份原表 → 原始资料/社保/_备份/
 * 2) 用 data/local/linyi/ss-card-outlets.json 中的地址/电话填充各原表
 * 3) 生成汇总表 临沂市社保卡即时制卡网点_已补全汇总.xlsx
 * 4) 同步刷新查询用 JSON
 *
 * 用法：node scripts/writeback-ss-card-xlsx.mjs [--phones]
 *   --phones  额外用高德 extensions=all 补电话（约数分钟）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { geocodeAmap, amapConfigured } from '../packages/shared/linyi-bank-geo.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SS_DIR = path.join(ROOT, '原始资料', '社保')
const BACKUP_DIR = path.join(SS_DIR, '_备份')
const JSON_PATH = path.join(ROOT, 'data/local/linyi/ss-card-outlets.json')
const WANT_PHONES = process.argv.includes('--phones')

function loadEnv () {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const i = s.indexOf('=')
      if (i <= 0) continue
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}
loadEnv()

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isMasked (s) {
  return /\*{2,}/.test(clean(s)) || clean(s) === '***'
}

function inferBank (name, fileHint = '') {
  const s = `${name} ${fileHint}`
  if (/工商|工行/.test(s)) return '工商银行'
  if (/农业|农行(?!商)/.test(s)) return '农业银行'
  if (/农商/.test(s)) return '农商银行'
  if (/中国银行|中行/.test(s)) return '中国银行'
  if (/邮储|邮政/.test(s)) return '邮储银行'
  if (/建行|建设/.test(s)) return '建设银行'
  if (/临商/.test(s)) return '临商银行'
  return '其他'
}

function colIndex (header, re) {
  return header.findIndex((h) => re.test(clean(h)))
}

function lookupEnrich (map, name) {
  const n = clean(name)
  if (map.has(n)) return map.get(n)
  // 宽松：去掉括号备注
  const base = n.replace(/[（(].*$/, '').trim()
  for (const [k, v] of map) {
    if (k.includes(n) || n.includes(k)) return v
    if (base && (k.includes(base) || base.includes(k.replace(/[（(].*$/, '').trim()))) return v
  }
  return null
}

if (!fs.existsSync(SS_DIR)) {
  console.error('目录不存在', SS_DIR)
  process.exit(1)
}
if (!fs.existsSync(JSON_PATH)) {
  console.error('缺少查询数据', JSON_PATH)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
/** @type {Map<string, any>} */
const byName = new Map()
for (const it of data.items || []) {
  byName.set(clean(it.name), it)
}

// 可选：补电话
if (WANT_PHONES && amapConfigured()) {
  console.log('补电话（高德 extensions=all）…')
  let ok = 0
  for (const it of data.items) {
    if (it.phone && !isMasked(it.phone)) continue
    try {
      await new Promise((r) => setTimeout(r, 320))
      const q = `${it.bank || ''} ${it.name}`.trim()
      const p = await geocodeAmap(q, '临沂', { extensions: 'all' })
      if (p.tel) {
        it.phone = p.tel
        it.phone_source = 'amap'
        it.phone_masked = false
        ok++
        console.log('TEL', it.name, p.tel)
      }
      if (p.address && (!it.address || it.address_source !== 'public_listing')) {
        // 保留已有地址；仅缺省时更新
        if (!it.address) {
          it.address = p.address
          it.address_source = 'amap'
        }
      }
      if (it.lat == null && p.lat != null) {
        it.lat = p.lat
        it.lng = p.lng
        it.name_matched = p.name_matched
      }
    } catch (e) {
      console.warn('TEL_FAIL', it.name, e?.message || e)
    }
  }
  console.log(`电话补全 ${ok} 条`)
}

fs.mkdirSync(BACKUP_DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const files = fs.readdirSync(SS_DIR).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$') && !f.includes('已补全'))

let totalFilled = 0
/** @type {Array<Record<string, string>>} */
const summaryRows = []

for (const file of files) {
  const full = path.join(SS_DIR, file)
  const bak = path.join(BACKUP_DIR, `${stamp}_${file}`)
  if (!fs.existsSync(bak)) fs.copyFileSync(full, bak)

  const wb = XLSX.readFile(full)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!rows.length) continue

  const header = rows[0].map((h) => clean(h))
  let iName = colIndex(header, /名称/)
  let iAddr = colIndex(header, /地址/)
  let iPhone = colIndex(header, /联系/)
  let iSeq = colIndex(header, /序号/)

  // 兼容列序
  if (iName < 0) iName = 0
  if (iAddr < 0) iAddr = header.length > 1 ? 1 : 0
  if (iPhone < 0) iPhone = -1

  let filled = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const name = clean(row[iName])
    if (!name) continue
    const hit = lookupEnrich(byName, name)
    if (!hit) continue

    const addr = clean(hit.address)
    const phone = clean(hit.phone)
    if (addr) {
      row[iAddr] = addr
      filled++
    }
    if (iPhone >= 0 && phone) {
      row[iPhone] = phone
    }

    summaryRows.push({
      银行: hit.bank || inferBank(name, file),
      网点名称: name,
      地址: addr || clean(row[iAddr]),
      联系方式: phone || (iPhone >= 0 ? clean(row[iPhone]) : ''),
      原脱敏地址: clean(hit.address_raw || ''),
      地址来源: hit.address_source || '',
      纬度: hit.lat != null ? String(hit.lat) : '',
      经度: hit.lng != null ? String(hit.lng) : '',
      来源文件: file,
      序号: iSeq >= 0 ? clean(row[iSeq]) : String(r)
    })
  }

  // 写回：保持表头，加「补全说明」列为可选——用户要原文档结构，不改表头
  const newSheet = XLSX.utils.aoa_to_sheet(rows)
  wb.Sheets[sheetName] = newSheet
  XLSX.writeFile(wb, full)
  totalFilled += filled
  console.log(`WRITE ${file} · 填充地址 ${filled} 行 → 已备份 ${path.basename(bak)}`)
}

// 汇总已补全表
summaryRows.sort((a, b) => a.银行.localeCompare(b.银行, 'zh') || a.网点名称.localeCompare(b.网点名称, 'zh'))
const sumWb = XLSX.utils.book_new()
const sumSheet = XLSX.utils.json_to_sheet(summaryRows)
XLSX.utils.book_append_sheet(sumWb, sumSheet, '社保卡制卡网点')
const sumPath = path.join(SS_DIR, '临沂市社保卡即时制卡网点_已补全汇总.xlsx')
XLSX.writeFile(sumWb, sumPath)
console.log(`SUM ${summaryRows.length} → ${sumPath}`)

// 刷新查询 JSON（以汇总为准去重）
/** @type {Map<string, any>} */
const merged = new Map()
for (const row of summaryRows) {
  const name = row.网点名称
  const prev = merged.get(name)
  const item = {
    id: `${row.来源文件}-${row.序号}`,
    name,
    bank: row.银行,
    phone_raw: row.联系方式,
    phone_masked: isMasked(row.联系方式),
    phone: isMasked(row.联系方式) ? '' : row.联系方式,
    phone_source: isMasked(row.联系方式) ? '' : byName.get(name)?.phone_source || 'writeback',
    address_raw: row.原脱敏地址,
    address_masked: Boolean(row.原脱敏地址 && isMasked(row.原脱敏地址)),
    address_hint: '',
    address: row.地址,
    address_source: row.地址来源 || 'writeback',
    lat: row.纬度 ? Number(row.纬度) : null,
    lng: row.经度 ? Number(row.经度) : null,
    source_file: row.来源文件,
    name_matched: byName.get(name)?.name_matched || '',
    enriched_at: byName.get(name)?.enriched_at || new Date().toISOString()
  }
  if (!prev) {
    merged.set(name, item)
  } else {
    if (item.address && !prev.address) {
      prev.address = item.address
      prev.address_source = item.address_source
      prev.lat = item.lat
      prev.lng = item.lng
    }
    if (item.phone && !prev.phone) {
      prev.phone = item.phone
      prev.phone_masked = false
      prev.phone_source = item.phone_source
    }
  }
}

const items = [...merged.values()].sort(
  (a, b) => a.bank.localeCompare(b.bank, 'zh') || a.name.localeCompare(b.name, 'zh')
)
const banks = [...new Set(items.map((x) => x.bank))].sort((a, b) => a.localeCompare(b, 'zh'))

const payload = {
  city: '临沂',
  updated: new Date().toISOString().slice(0, 10),
  category: 'social',
  category_label: '人社社保',
  source: {
    files: files,
    filled_summary: path.basename(sumPath),
    backup_dir: '原始资料/社保/_备份',
    publisher: '临沂市人力资源和社会保障局 / 各承办银行',
    portal: 'http://lydata.sd.gov.cn/'
  },
  banks,
  count: items.length,
  masked_address_count: items.filter((x) => !x.address).length,
  masked_phone_count: items.filter((x) => !x.phone).length,
  enriched_ok: items.filter((x) => x.address).length,
  enriched_at: new Date().toISOString(),
  enrich_hint: '原表脱敏字段已写回补全地址；电话若仍脱敏可运行 npm run writeback:ss-card -- --phones',
  items,
  disclaimer:
    '社保卡即时制卡网点已据开放网名录补全地址（高德/公开渠道）。电话可能仍为脱敏或来自地图 POI，办理前请电话确认网点状态。'
}

fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2), 'utf8')
console.log(
  `JSON ${items.length} · 有地址 ${items.filter((x) => x.address).length} · 有电话 ${items.filter((x) => x.phone).length} → ${JSON_PATH}`
)
console.log(`合计写回地址单元格约 ${totalFilled}`)
