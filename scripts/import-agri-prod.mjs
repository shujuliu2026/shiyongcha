/**
 * 导入临沂分县区农业生产（蔬菜 / 夏粮 / 秋收）→ agri-production.json
 *
 * 用法：node scripts/import-agri-prod.mjs
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
const OUT = path.join(ROOT, 'data/local/linyi/agri-production.json')

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNum (v) {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function findFile (hint) {
  const hit = fs.readdirSync(RAW).find((f) => f.includes(hint) && /\.xlsx$/i.test(f) && !f.includes('_0'))
  return hit ? path.join(RAW, hit) : null
}

function headerIndex (header, re) {
  return header.findIndex((h) => re.test(clean(h)))
}

function parseSheet (abs, kind, kindLabel) {
  const wb = XLSX.readFile(abs)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  if (!rows.length) return []
  const header = rows[0].map(clean)
  const iDist = headerIndex(header, /县区|区县/)
  const iYear = headerIndex(header, /年份/)
  const iTotal = headerIndex(header, /总产量/)
  const iArea = headerIndex(header, /播种面积/)
  const iYield = headerIndex(header, /单产/)
  if (iDist < 0 || iYear < 0 || iTotal < 0) {
    throw new Error(`表头不完整: ${path.basename(abs)} · ${header.join('|')}`)
  }

  const items = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const district = clean(r[iDist])
    const yearRaw = clean(r[iYear])
    const yearNorm = !yearRaw ? '' : yearRaw.includes('年') ? yearRaw : `${yearRaw}年`
    if (!district || !yearNorm) continue
    const total = toNum(r[iTotal])
    const area = iArea >= 0 ? toNum(r[iArea]) : null
    let unitYield = iYield >= 0 ? toNum(r[iYield]) : null
    if (unitYield == null && total != null && area && area > 0) {
      // 蔬菜表无单产：吨→公斤/亩
      unitYield = (total * 1000) / area
    }
    items.push({
      id: `${kind}-${yearNorm}-${district}`,
      kind,
      kind_label: kindLabel,
      district,
      year: yearNorm,
      year_num: Number(String(yearNorm).replace(/年/, '')) || null,
      total_ton: total,
      area_mu: area,
      yield_kg_mu: unitYield != null ? Math.round(unitYield * 100) / 100 : null,
      is_city: district === '临沂市'
    })
  }
  return items
}

const specs = [
  {
    hint: '蔬菜（含菜用瓜）生产情况',
    kind: 'veg',
    label: '蔬菜（含菜用瓜）'
  },
  {
    hint: '夏收粮食生产情况',
    kind: 'grain_summer',
    label: '夏收粮食'
  },
  {
    hint: '秋收粮食生产情况',
    kind: 'grain_autumn',
    label: '秋收粮食'
  }
]

const all = []
const sources = {}
for (const s of specs) {
  const abs = findFile(s.hint)
  if (!abs) {
    console.error('缺少文件', s.hint)
    process.exit(1)
  }
  const items = parseSheet(abs, s.kind, s.label)
  sources[s.kind] = path.basename(abs)
  console.log(s.kind, items.length, path.basename(abs))
  all.push(...items)
}

all.sort((a, b) => {
  const y = (b.year_num || 0) - (a.year_num || 0)
  if (y) return y
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
  if (a.is_city !== b.is_city) return a.is_city ? -1 : 1
  return a.district.localeCompare(b.district, 'zh')
})

const years = [...new Set(all.map((x) => x.year))].sort().reverse()
const districts = [...new Set(all.map((x) => x.district))]
  .sort((a, b) => {
    if (a === '临沂市') return -1
    if (b === '临沂市') return 1
    return a.localeCompare(b, 'zh')
  })

const payload = {
  city: '临沂',
  updated: '2025-08-01',
  category: 'agriculture',
  category_label: '农业行情',
  source: {
    files: sources,
    publisher: '临沂市统计局（开放数据）',
    portal: 'http://lydata.sd.gov.cn/'
  },
  kinds: specs.map((s) => ({ id: s.kind, label: s.label })),
  years,
  districts,
  count: all.length,
  items: all,
  disclaimer:
    '数据来自临沂公共数据开放网分县区生产情况表（约 2017–2019）；单位：产量吨、面积亩、单产公斤/亩。蔬菜单产由产量/面积推算。仅供参考。'
}

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8')
console.log('JSON', OUT, 'count', all.length)

// inventory
const invPath = path.join(ROOT, 'data/local/linyi/open-data-inventory.json')
if (fs.existsSync(invPath)) {
  const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'))
  inv.updated = new Date().toISOString().slice(0, 10)
  const agri = inv.categories?.find((c) => c.id === 'agriculture')
  if (agri) {
    agri.label = '农业行情'
    for (const d of agri.datasets || []) {
      d.tool_id = 'agri-prod'
      d.status = 'ready'
    }
  }
  fs.writeFileSync(invPath, JSON.stringify(inv, null, 2) + '\n', 'utf8')
  console.log('inventory updated')
}
