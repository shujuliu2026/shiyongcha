/**
 * 临沂户籍窗口电话 + 自助受理点 → data/local/linyi/hukou-windows.json
 *
 * 默认读取 原始资料/：
 * - 临沂市户籍窗口咨询电话大全.xlsx（户籍窗口）
 * - 户籍自助查询_20260808.csv（自助机）
 *
 * 用法：node scripts/import-hukou-xlsx.mjs [xlsx路径] [csv路径]
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
const OUT = path.join(ROOT, 'data', 'local', 'linyi', 'hukou-windows.json')

function clean (s) {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2011\u2013\u2014\u2212]/g, '-') // 非断连字符等 → -
    .replace(/\s+/g, ' ')
    .trim()
}

function guessDistrict (text) {
  const s = clean(text)
  const names = [
    '兰山区', '罗庄区', '河东区', '沂南县', '郯城县', '沂水县', '兰陵县',
    '莒南县', '蒙阴县', '平邑县', '费县', '临沭县', '高新区', '经开区', '临港区'
  ]
  for (const n of names) {
    if (s.includes(n) || s.includes(n.replace(/[区县]$/, ''))) return n
  }
  if (/罗庄/.test(s)) return '罗庄区'
  if (/兰山/.test(s)) return '兰山区'
  if (/河东/.test(s)) return '河东区'
  return ''
}

function splitPhones (raw) {
  return clean(raw)
    .split(/[、,，;/｜|]+/)
    .map((p) => clean(p).replace(/\s+/g, ''))
    .filter((p) => p && p !== '-')
}

function findDefaultXlsx () {
  if (!fs.existsSync(RAW)) return null
  const hit = fs.readdirSync(RAW).find((n) => n.includes('户籍窗口') && n.endsWith('.xlsx'))
  return hit ? path.join(RAW, hit) : null
}

function findDefaultCsv () {
  if (!fs.existsSync(RAW)) return null
  const hit = fs.readdirSync(RAW).find((n) => n.includes('户籍自助') && n.endsWith('.csv'))
  return hit ? path.join(RAW, hit) : null
}

function makeId (kind, district, name) {
  return `${kind}|${district || ''}|${name || ''}`.slice(0, 220)
}

function importWindows (xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const items = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const district = clean(row[0])
    const name = clean(row[1])
    const phones = splitPhones(row[2])
    const address = clean(row[3])
    const note = clean(row[4])
    if (!name && !phones.length) continue
    items.push({
      id: makeId('window', district, name),
      kind: 'window',
      district,
      name,
      phones,
      tel: phones[0] || '',
      address: address === '-' ? '' : address,
      note,
      services: '户籍窗口咨询预约'
    })
  }
  return items
}

function importSelfServe (csvPath) {
  let text = fs.readFileSync(csvPath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const wb = XLSX.read(text, { type: 'string' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const items = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const name = clean(row[1])
    const address = clean(row[2])
    const services = clean(row[3])
    const phones = splitPhones(row[4])
    if (!name && !phones.length) continue
    const district = guessDistrict(`${name} ${address}`)
    items.push({
      id: makeId('self', district, name),
      kind: 'self',
      district,
      name,
      phones,
      tel: phones[0] || '',
      address: address === '-' ? '' : address,
      note: '',
      services: services || '自助受理'
    })
  }
  return items
}

const xlsxSrc = process.argv[2] ? path.resolve(process.argv[2]) : findDefaultXlsx()
const csvSrc = process.argv[3] ? path.resolve(process.argv[3]) : findDefaultCsv()

if (!xlsxSrc && !csvSrc) {
  console.error('未找到 户籍窗口 xlsx 或 户籍自助 csv（原始资料/）')
  process.exit(1)
}

/** @type {Map<string, Record<string, unknown>>} */
const prevById = new Map()
if (fs.existsSync(OUT)) {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'))
    for (const it of prev.items || []) {
      if (it?.id) prevById.set(String(it.id), it)
    }
  } catch {
    /* ignore */
  }
}

const windows = xlsxSrc && fs.existsSync(xlsxSrc) ? importWindows(xlsxSrc) : []
const selfServe = csvSrc && fs.existsSync(csvSrc) ? importSelfServe(csvSrc) : []
const items = [...windows, ...selfServe].map((it) => {
  const old = prevById.get(it.id)
  if (!old) return it
  const next = { ...it }
  for (const k of ['lat', 'lng', 'geo_provider', 'geo_address', 'geocoded_at']) {
    if (old[k] != null && old[k] !== '') next[k] = old[k]
  }
  return next
})

const districts = [...new Set(items.map((i) => i.district).filter(Boolean))].sort((a, b) =>
  a.localeCompare(b, 'zh-CN')
)

const geoOk = items.filter((i) => i.lat != null && i.lng != null).length

const payload = {
  city: '临沂',
  city_id: 'linyi',
  updated: '2026-08-08',
  source_note: [
    xlsxSrc ? path.basename(xlsxSrc) : null,
    csvSrc ? path.basename(csvSrc) : null
  ]
    .filter(Boolean)
    .join(' + '),
  disclaimer: '电话与地址仅供参考，请以公安机关最新公示为准；拨打前请确认服务时间。地图坐标为地理编码参考，非官方勘界。',
  kinds: [
    { id: 'window', label: '户籍窗口', count: windows.length },
    { id: 'self', label: '自助受理点', count: selfServe.length }
  ],
  districts,
  count: items.length,
  geo_ok: geoOk,
  items
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`wrote ${OUT}`)
console.log(`windows=${windows.length} self=${selfServe.length} total=${items.length} geo=${geoOk} districts=${districts.length}`)
