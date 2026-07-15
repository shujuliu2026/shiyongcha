/**
 * 本地银行网点「地点」核实：扫 cnaps-full，检查 city=临沂 命中质量
 * node scripts/audit-linyi-banks.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FULL = path.join(ROOT, 'data/cnaps-full.jsonl')

const DISTRICTS = [
  '兰山区', '罗庄区', '河东区',
  '沂南县', '郯城县', '沂水县', '兰陵县', '费县', '平邑县', '莒南县', '蒙阴县', '临沭县',
  '高新技术产业开发区', '高新区', '经济技术开发区', '经开区', '临港区', '综保区'
]

const PLACE_MARKERS = [
  '临沂市', '临沂分行', '临沂支行', '临沂县',
  '兰山', '罗庄', '河东', '沂南', '郯城', '沂水', '兰陵', '费县', '平邑', '莒南', '蒙阴', '临沭',
  '临商', '金雀山', '开阳路', '通达路', '沂蒙路', '解放路', '启阳', '北城', '南坊'
]

function matchRegionInName (name, region) {
  if (!name.includes(region)) return false
  if (region === '临沂') {
    const roadOnly = /临沂路/.test(name) && !/临沂(市|县|区|分行|支行|办)/.test(name)
    if (roadOnly) return false
    if (
      /(浦东新区临沂|上海市临沂|上海临沂路)/.test(name) ||
      (/(北京|天津|重庆|上海市).{0,24}临沂(路|支行)/.test(name) && !/临沂(市|分行)/.test(name))
    ) {
      return false
    }
    if (/阜阳/.test(name) && /临沂/.test(name)) return false
  }
  return true
}

function districtOf (name) {
  for (const d of DISTRICTS) {
    if (name.includes(d.replace(/[区县市]$/, '')) || name.includes(d)) {
      // prefer full district names
      if (name.includes(d)) return d
    }
  }
  // softer
  if (/兰山/.test(name)) return '兰山区'
  if (/罗庄/.test(name)) return '罗庄区'
  if (/河东/.test(name)) return '河东区'
  if (/沂南/.test(name)) return '沂南县'
  if (/郯城/.test(name)) return '郯城县'
  if (/沂水/.test(name)) return '沂水县'
  if (/兰陵|苍山/.test(name)) return '兰陵县'
  if (/费县/.test(name)) return '费县'
  if (/平邑/.test(name)) return '平邑县'
  if (/莒南/.test(name)) return '莒南县'
  if (/蒙阴/.test(name)) return '蒙阴县'
  if (/临沭/.test(name)) return '临沭县'
  if (/高新/.test(name)) return '高新区'
  if (/经开|开发区/.test(name)) return '经开区'
  return '临沂市（未拆区县）'
}

function suspicion (name) {
  /** @type {string[]} */
  const reasons = []
  if (/临沂路/.test(name) && !/临沂(市|分行|支行|办)/.test(name)) reasons.push('疑路名临沂路')
  // 仍应被拦截的外地「临沂」支行名
  if (/浦东新区临沂|上海市临沂/.test(name) && !/临沂(市|分行)/.test(name)) reasons.push('疑上海本地临沂支行')
  return reasons
}

if (!fs.existsSync(FULL)) {
  console.error('缺少 data/cnaps-full.jsonl，请先 npm run import:cnaps')
  process.exit(1)
}

const text = fs.readFileSync(FULL, 'utf8')
/** @type {{ c: string, n: string, b: string }[]} */
const hits = []
/** @type {{ c: string, n: string, b: string, reasons: string[] }[]} */
const rejectedRoad = []
let total = 0

for (const line of text.split('\n')) {
  if (!line) continue
  total++
  let row
  try {
    row = JSON.parse(line)
  } catch {
    continue
  }
  const name = String(row.n || '')
  if (!name.includes('临沂')) continue
  if (!matchRegionInName(name, '临沂')) {
    rejectedRoad.push({ c: row.c, n: name, b: row.b, reasons: ['临沂路过滤'] })
    continue
  }
  hits.push({ c: row.c, n: name, b: row.b })
}

const byDistrict = {}
const byBank = {}
const suspicious = []
for (const h of hits) {
  const d = districtOf(h.n)
  byDistrict[d] = (byDistrict[d] || 0) + 1
  byBank[h.b] = (byBank[h.b] || 0) + 1
  const reasons = suspicion(h.n)
  if (reasons.length) suspicious.push({ ...h, reasons })
}

const topBanks = Object.entries(byBank).sort((a, b) => b[1] - a[1]).slice(0, 20)
const districtSorted = Object.entries(byDistrict).sort((a, b) => b[1] - a[1])

const report = {
  generated_at: new Date().toISOString(),
  corpus_total: total,
  linyi_hits: hits.length,
  rejected_linyi_road: rejectedRoad.length,
  rejected_samples: rejectedRoad.slice(0, 15),
  by_district: Object.fromEntries(districtSorted),
  top_banks: Object.fromEntries(topBanks),
  suspicious_count: suspicious.length,
  suspicious_samples: suspicious.slice(0, 30),
  note: '源表无独立地址/坐标；「地点」仅能从联行名称推断区县，正式地址请以柜台/网银/地图为准。'
}

const outJson = path.join(ROOT, 'data/linyi-bank-audit.json')
const outMd = path.join(ROOT, 'docs/本地银行网点核实.md')
fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8')

const md = `# 本地银行网点地点核实

生成时间：${report.generated_at}

## 结论摘要

| 项 | 值 |
|----|-----|
| 全量库 | ${total.toLocaleString()} 条 |
| 「临沂」有效命中 | **${hits.length}** 条 |
| 「临沂路」误匹配已过滤 | ${rejectedRoad.length} 条 |
| 疑似异常（人工抽检） | ${suspicious.length} 条 |

**源表字段只有联行号 + 联行名称 + 总行，没有门牌地址、没有经纬度。**  
「本地网点」= 名称含「临沂」的支付系统行号目录，**不是地图 POI**。核实地点只能：

1. 从支行名称解析区县（兰山/罗庄/河东/九县等）  
2. 排除外地「临沂路」等路名误命中  
3. 对账时以柜台/网银/官方网点地图为准  

## 区县分布（从名称推断）

${districtSorted.map(([k, v]) => `- ${k}：${v}`).join('\n')}

## 命中最多的总行（Top 20）

${topBanks.map(([k, v]) => `- ${k}：${v}`).join('\n')}

## 「临沂路」过滤样例

${rejectedRoad.slice(0, 10).map((r) => `- \`${r.c}\` ${r.n}`).join('\n') || '（无）'}

## 疑似异常样例

${suspicious.slice(0, 15).map((r) => `- [${r.reasons.join(',')}] \`${r.c}\` ${r.n}`).join('\n') || '（无）'}

## 页面提示（产品）

- \`/local-bank\` 应标明：**可复制联行号；地址以支行名为准，非地图定位**  
- 增加区县标签（推断），方便用户核对是否办业务所在区  

机器可读报告：\`data/linyi-bank-audit.json\`
`

fs.writeFileSync(outMd, md, 'utf8')
console.log(JSON.stringify({
  hits: hits.length,
  rejected_road: rejectedRoad.length,
  suspicious: suspicious.length,
  districts: districtSorted.length,
  wrote: [outJson, outMd]
}, null, 2))
