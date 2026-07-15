/**
 * 临沂市公交站亭普查信息 xlsx → data/local/linyi/bus-shelters.json
 *
 * 表头：位置 | 权属单位 | 名称 | 代码 | 养护单位
 * 以第一列「位置」为主作站亭位置描述。
 *
 * 用法：node scripts/import-bus-shelters-xlsx.mjs [xlsx路径]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'data', 'local', 'linyi', 'bus-shelters.json')

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} address */
function roadOf (address) {
  const m = String(address).match(/^([\u4e00-\u9fffA-Za-z0-9]{2,16}(?:路|街|道|大道|巷|弄))/)
  return m ? m[1] : ''
}

function findDefaultXlsx () {
  const dirs = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ROOT, d.name))
  const candidates = []
  for (const dir of [...dirs, path.join(ROOT, 'data'), ROOT]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (name.includes('202508010320') && name.endsWith('.xlsx')) {
        candidates.push(path.join(dir, name))
      }
      if (name.includes('站亭') && name.endsWith('.xlsx')) {
        candidates.push(path.join(dir, name))
      }
    }
  }
  return candidates[0] || null
}

const src = process.argv[2] ? path.resolve(process.argv[2]) : findDefaultXlsx()
if (!src || !fs.existsSync(src)) {
  console.error('未找到 临沂市公交站亭普查信息*.xlsx')
  process.exit(1)
}

const wb = XLSX.readFile(src)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

const items = []
const owners = new Set()
const names = new Set()
const maintainers = new Set()
/** @type {Record<string, number>} */
const roadCount = {}

for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  if (!row || !row.length) continue
  const address = clean(row[0])
  if (!address) continue
  const owner = clean(row[1])
  const name = clean(row[2]) || '公交站亭'
  const code = clean(row[3])
  const maintainer = clean(row[4])
  const road = roadOf(address)
  if (owner) owners.add(owner)
  if (name) names.add(name)
  if (maintainer) maintainers.add(maintainer)
  if (road) roadCount[road] = (roadCount[road] || 0) + 1
  items.push({ id: String(i), address, road, owner, name, code, maintainer })
}

const roads = Object.entries(roadCount)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
  .map(([road, count]) => ({ road, count }))

const payload = {
  city: '临沂',
  updated: '2025-08-01',
  source: {
    title: '临沂市公交站亭普查信息',
    file: path.basename(src),
    publisher: '临沂市公共交通集团有限公司',
    portal: 'http://lydata.sd.gov.cn/'
  },
  owners: [...owners].sort((a, b) => a.localeCompare(b, 'zh')),
  names: [...names].sort((a, b) => a.localeCompare(b, 'zh')),
  maintainers: [...maintainers].sort((a, b) => a.localeCompare(b, 'zh')),
  roads,
  count: items.length,
  items,
  disclaimer:
    '数据来源于临沂市公交站亭普查公开清单（开放网表）。第一列为站亭位置描述；站点可能迁改或更名，请以现场与公交集团公示为准。'
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
console.log(`OK ${items.length} → ${OUT}`)
console.log(`owners: ${payload.owners.join(' / ')}`)
console.log(`roads: ${roads.length}（前 5：${roads.slice(0, 5).map((r) => r.road).join('、')}）`)
