/**
 * 将目录内 银行支行编码.xlsx 导入为 data/cnaps-full.jsonl
 *
 * 表头：联行号 | 联行名称 | 总行银行号 | 总行银行名称
 *
 * 用法：node scripts/import-cnaps-xlsx.mjs [xlsx路径]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'data', 'cnaps-full.jsonl')
const META_OUT = path.join(ROOT, 'data', 'cnaps-full.meta.json')

function findDefaultXlsx () {
  const candidates = [
    path.join(ROOT, 'data', '银行支行编码.xlsx'),
    path.join(ROOT, '银行支行编码.xlsx'),
    ...fs.readdirSync(ROOT).filter((n) => n.endsWith('.xlsx')).map((n) => path.join(ROOT, n)),
    ...fs.existsSync(path.join(ROOT, 'data'))
      ? fs.readdirSync(path.join(ROOT, 'data')).filter((n) => n.endsWith('.xlsx')).map((n) => path.join(ROOT, 'data', n))
      : []
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

const src = process.argv[2] ? path.resolve(process.argv[2]) : findDefaultXlsx()
if (!src || !fs.existsSync(src)) {
  console.error('未找到 银行支行编码.xlsx，请放到 D:\\projects\\tool\\ 或 data\\ 下')
  process.exit(1)
}

console.log('读取', src)
const t0 = Date.now()
const wb = XLSX.readFile(src)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
console.log('行数', rawRows.length, 'sheet', wb.SheetNames[0])

const banks = new Set()
const lines = []
let skipped = 0

for (const r of rawRows) {
  const cnaps = String(r['联行号'] ?? r.cnaps ?? '').trim()
  const name = String(r['联行名称'] ?? r.name ?? '').trim()
  const bankCode = String(r['总行银行号'] ?? r.bankCode ?? '').trim()
  const bank = String(r['总行银行名称'] ?? r.bank ?? '').trim()
  if (!/^\d{12}$/.test(cnaps) || !name) {
    skipped++
    continue
  }
  if (bank) banks.add(bank)
  lines.push(JSON.stringify({ c: cnaps, n: name, b: bank, bc: bankCode }))
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')

const meta = {
  source_file: path.basename(src),
  imported_at: new Date().toISOString(),
  total: lines.length,
  skipped,
  bank_count: banks.size,
  banks: [...banks].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  columns: ['联行号', '联行名称', '总行银行号', '总行银行名称'],
  note: '查询以本文件为准；xlsx 仅作导入源'
}
fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2), 'utf8')

// 归档源文件到 data/
const destXlsx = path.join(ROOT, 'data', '银行支行编码.xlsx')
if (path.resolve(src) !== path.resolve(destXlsx)) {
  fs.copyFileSync(src, destXlsx)
  console.log('已复制源表 →', destXlsx)
}

console.log('写出', OUT)
console.log('元数据', META_OUT)
console.log(`完成 ${lines.length} 条 · ${banks.size} 家总行 · ${Date.now() - t0}ms · 跳过 ${skipped}`)
