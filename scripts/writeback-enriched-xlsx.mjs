/**
 * 将已补全 JSON 地址/电话写回 原始资料/*.xlsx
 *
 * 覆盖：货运场站、客运场站、驾校一二三级、职业培训机构
 * 原表备份到 原始资料/_备份/
 *
 * 用法：node scripts/writeback-enriched-xlsx.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, '原始资料')
const BACKUP = path.join(RAW, '_备份')
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '')

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isMasked (s) {
  return /\*{2,}/.test(clean(s)) || clean(s) === '***'
}

function colIndex (header, re) {
  return header.findIndex((h) => re.test(clean(h)))
}

function ensureDir (d) {
  fs.mkdirSync(d, { recursive: true })
}

function loadItems (rel) {
  const p = path.join(ROOT, 'data/local/linyi', rel)
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  /** @type {Map<string, any>} */
  const map = new Map()
  for (const it of j.items || []) {
    const n = clean(it.name)
    if (n) map.set(n, it)
  }
  return { meta: j, map }
}

function lookup (map, name) {
  const n = clean(name)
  if (!n) return null
  if (map.has(n)) return map.get(n)
  const base = n.replace(/[（(].*$/, '').trim()
  for (const [k, v] of map) {
    if (k === base || n.includes(k) || k.includes(n)) return v
    const kb = k.replace(/[（(].*$/, '').trim()
    if (base && kb && (base === kb || base.includes(kb) || kb.includes(base))) return v
  }
  return null
}

function backupFile (abs) {
  ensureDir(BACKUP)
  const dest = path.join(BACKUP, `${STAMP}_${path.basename(abs)}`)
  if (!fs.existsSync(dest)) fs.copyFileSync(abs, dest)
  return dest
}

/**
 * @param {{ file: string, json: string, nameRe?: RegExp, addrRe?: RegExp, phoneRe?: RegExp, filter?: (it:any)=>boolean }} job
 */
function writebackJob (job) {
  const abs = path.join(RAW, job.file)
  if (!fs.existsSync(abs)) {
    console.warn('SKIP missing', job.file)
    return { file: job.file, filledAddr: 0, filledPhone: 0, rows: 0 }
  }
  const { map } = loadItems(job.json)
  const bak = backupFile(abs)
  const wb = XLSX.readFile(abs)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!rows.length) return { file: job.file, filledAddr: 0, filledPhone: 0, rows: 0 }

  const header = rows[0].map(clean)
  const nameIdx = colIndex(header, job.nameRe || /名称|机构名称/)
  const addrIdx = colIndex(header, job.addrRe || /^地址|地址$/)
  const phoneIdx = colIndex(header, job.phoneRe || /电话|联系方式|联系电话/)
  if (nameIdx < 0) {
    console.warn('SKIP no name col', job.file, header)
    return { file: job.file, filledAddr: 0, filledPhone: 0, rows: 0 }
  }

  let filledAddr = 0
  let filledPhone = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    while (row.length < header.length) row.push('')
    const name = clean(row[nameIdx])
    if (!name) continue
    const hit = lookup(map, name)
    if (!hit) continue
    if (job.filter && !job.filter(hit)) continue
    if (addrIdx >= 0 && hit.address && (isMasked(row[addrIdx]) || !clean(row[addrIdx]))) {
      row[addrIdx] = hit.address
      filledAddr++
    }
    if (phoneIdx >= 0 && hit.phone && (isMasked(row[phoneIdx]) || !clean(row[phoneIdx]))) {
      row[phoneIdx] = hit.phone
      filledPhone++
    }
  }

  const out = XLSX.utils.aoa_to_sheet(rows)
  wb.Sheets[sheetName] = out
  XLSX.writeFile(wb, abs)
  console.log(
    `WRITE ${job.file} · 地址 ${filledAddr} · 电话 ${filledPhone} · 备份 ${path.basename(bak)}`
  )
  return { file: job.file, filledAddr, filledPhone, rows: rows.length - 1 }
}

const jobs = [
  {
    file: '全市道路货运场站信息202508010315.xlsx',
    json: 'freight-stations.json',
    nameRe: /^名称/
  },
  {
    file: '道路运输客运场站信息202508010106.xlsx',
    json: 'passenger-stations.json',
    nameRe: /^名称/
  },
  {
    file: '一级普通机动车驾驶员培训机构信息202508010118.xlsx',
    json: 'driving-schools.json',
    nameRe: /^名称/,
    filter: (it) => it.level === '一级'
  },
  {
    file: '二级普通机动车驾驶员培训机构信息202508010103.xlsx',
    json: 'driving-schools.json',
    nameRe: /^名称/,
    filter: (it) => it.level === '二级'
  },
  {
    file: '三级普通机动车驾驶员培训机构信息202508010156.xlsx',
    json: 'driving-schools.json',
    nameRe: /^名称/,
    filter: (it) => it.level === '三级'
  },
  {
    file: '职业培训机构目录202508040915.xlsx',
    json: 'training-orgs.json',
    nameRe: /机构名称|名称/,
    phoneRe: /联系电话|电话/
  }
]

ensureDir(BACKUP)
const results = jobs.map(writebackJob)
const sumAddr = results.reduce((a, r) => a + r.filledAddr, 0)
const sumPhone = results.reduce((a, r) => a + r.filledPhone, 0)
console.log(`合计写回 地址单元格 ${sumAddr} · 电话 ${sumPhone}`)
