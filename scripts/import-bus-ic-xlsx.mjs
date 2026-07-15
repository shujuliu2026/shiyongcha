/**
 * 临沂市公交集团公交IC卡办理网点 xlsx → data/local/linyi/bus-ic-outlets.json
 *
 * 表头：网点类型 | 详细地址 | 网点名称 | 区域
 *
 * 用法：node scripts/import-bus-ic-xlsx.mjs [xlsx路径]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'data', 'local', 'linyi', 'bus-ic-outlets.json')

const HOURS_RE = /[（(]\s*营业时间[:：]\s*(.+?)\s*[）)]\s*$/s

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findDefaultXlsx () {
  const rawDirs = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ROOT, d.name))
  const candidates = []
  for (const dir of [...rawDirs, path.join(ROOT, 'data'), ROOT]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (name.includes('202508010248') && name.endsWith('.xlsx')) {
        candidates.push(path.join(dir, name))
      }
      if (name.includes('IC') && name.includes('网点') && name.endsWith('.xlsx')) {
        candidates.push(path.join(dir, name))
      }
    }
  }
  return candidates[0] || null
}

const src = process.argv[2] ? path.resolve(process.argv[2]) : findDefaultXlsx()
if (!src || !fs.existsSync(src)) {
  console.error('未找到 临沂市公交集团公交IC卡办理网点*.xlsx')
  process.exit(1)
}

const wb = XLSX.readFile(src)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
const items = []
const typeSet = new Set()
const districtSet = new Set()

for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  if (!row || !row.length) continue
  const type = clean(row[0])
  const addrRaw = clean(row[1])
  const name = clean(row[2])
  const district = clean(row[3])
  if (!name && !addrRaw) continue

  let hours = ''
  let address = addrRaw
  const m = addrRaw.match(HOURS_RE)
  if (m) {
    hours = clean(m[1])
    address = clean(addrRaw.slice(0, m.index))
  }

  if (type) typeSet.add(type)
  if (district) districtSet.add(district)
  items.push({ type, name, district, address, hours })
}

const payload = {
  city: '临沂',
  updated: '2025-08-01',
  source: {
    title: '临沂市公交集团公交IC卡办理网点',
    file: path.basename(src),
    publisher: '临沂市公共交通集团有限公司',
    portal: 'http://lydata.sd.gov.cn/'
  },
  types: [...typeSet].sort(),
  districts: [...districtSet].sort(),
  count: items.length,
  items,
  disclaimer:
    '数据来源于临沂市公共交通集团公开清单（开放网表），网点与营业时间可能变更；办理前请以现场公示或服务热线 0539-8313159 为准。综合服务窗口可办理普通卡、老年卡、学生卡、爱心卡、优抚卡等业务；代理充值网点以机构营业时间为准。'
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
console.log(`OK ${items.length} → ${OUT}`)
console.log(`types: ${payload.types.join(' / ')}`)
console.log(`districts: ${payload.districts.join(' / ')}`)
