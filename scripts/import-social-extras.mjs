/**
 * 导入人社社保未入库开放表 → 查询 JSON，并合并工伤统筹入 social-regions
 *
 * - 工伤保险统筹区划编码 → social-regions.injury
 * - 失业保险技能提升补贴经办机构 → skill-subsidy-offices.json
 * - 专业技术人员继续教育基地 → edu-bases.json
 *
 * 用法：node scripts/import-social-extras.mjs
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
const OUT = path.join(ROOT, 'data/local/linyi')

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findXlsx (hints) {
  const files = fs.readdirSync(RAW).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
  for (const h of hints) {
    const hit = files.find((f) => f.includes(h))
    if (hit) return path.join(RAW, hit)
  }
  return null
}

function sheetRows (abs) {
  const wb = XLSX.readFile(abs)
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}

function writeJson (name, data) {
  const p = path.join(OUT, name)
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log('JSON', name, data.count ?? data.items?.length)
}

// —— 1) 工伤 → 合并 social-regions ——
const injurySrc = findXlsx(['工伤保险统筹区划编码信息', '工伤保险统筹区划'])
const socialPath = path.join(OUT, 'social-regions.json')
const social = JSON.parse(fs.readFileSync(socialPath, 'utf8'))
/** @type {Map<string, any>} */
const byCode = new Map(social.items.map((it) => [clean(it.code), it]))
/** @type {Map<string, any>} */
const byName = new Map(social.items.map((it) => [clean(it.name), it]))

if (injurySrc) {
  const rows = sheetRows(injurySrc).slice(1)
  let matched = 0
  let added = 0
  for (const r of rows) {
    const agency = clean(r[0]) || '社保经办机构'
    const name = clean(r[1])
    const code = clean(r[2])
    if (!code && !name) continue
    let prev = (code && byCode.get(code)) || (name && byName.get(name))
    if (!prev) {
      prev = {
        code: code || '',
        name: name || '',
        agency,
        unemployment: false,
        pension: false,
        injury: true
      }
      social.items.push(prev)
      if (code) byCode.set(code, prev)
      if (name) byName.set(name, prev)
      added++
    } else {
      prev.injury = true
      if (agency && !prev.agency) prev.agency = agency
      matched++
    }
  }
  social.items.sort((a, b) => String(a.code).localeCompare(String(b.code)))
  social.count = social.items.length
  social.updated = new Date().toISOString().slice(0, 10)
  social.source = {
    ...social.source,
    injury_file: path.basename(injurySrc)
  }
  social.disclaimer =
    '区划编码来自临沂开放网失业/养老/工伤保险公开表，办理业务请以社保经办机构现场公示为准。'
  writeJson('social-regions.json', social)
  console.log(`injury 匹配已有 ${matched} · 新增 ${added}`)
} else {
  console.warn('缺工伤区划 xlsx')
}

// —— 2) 技能提升补贴经办 ——
const skillSrc = findXlsx(['失业保险技能提升补贴经办机构', '技能提升补贴经办'])
if (skillSrc) {
  const rows = sheetRows(skillSrc).slice(1)
  const items = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const city = clean(r[0])
    const name = clean(r[1])
    if (!name) continue
    const address = clean(r[2])
    const phoneRaw = clean(r[3])
    items.push({
      id: String(i + 1),
      city,
      name,
      address,
      phone_raw: phoneRaw,
      phone_masked: /\*/.test(phoneRaw) || !phoneRaw,
      phone: /\*/.test(phoneRaw) ? '' : phoneRaw,
      is_linyi: /临沂/.test(city)
    })
  }
  writeJson('skill-subsidy-offices.json', {
    city: '临沂',
    updated: '2025-08-01',
    category: 'social',
    category_label: '人社社保',
    source: {
      file: path.basename(skillSrc),
      publisher: '山东省/临沂人社（开放数据）',
      portal: 'http://lydata.sd.gov.cn/'
    },
    count: items.length,
    items,
    disclaimer: '电话字段在开放表中多为脱敏；临沂办事地址见本市条目，办理以现场公示为准。'
  })
}

// —— 3) 继续教育基地 ——
const eduSrc = findXlsx(['专业技术人员继续教育基地名单', '继续教育基地'])
if (eduSrc) {
  const rows = sheetRows(eduSrc).slice(1)
  const items = []
  for (const r of rows) {
    // 公示时间 / 序号 / 基地名称
    const seq = clean(r[1])
    const name = clean(r[2]) || clean(r[1])
    if (!name || name === '基地名称') continue
    if (!/\d/.test(seq) && items.length === 0 && /序号|名称/.test(name)) continue
    items.push({
      id: seq || String(items.length + 1),
      name,
      city: '临沂'
    })
  }
  writeJson('edu-bases.json', {
    city: '临沂',
    updated: '2025-08-01',
    category: 'social',
    category_label: '人社社保',
    source: {
      file: path.basename(eduSrc),
      publisher: '临沂市人力资源和社会保障局',
      portal: 'http://lydata.sd.gov.cn/'
    },
    count: items.length,
    items,
    disclaimer: '继续教育基地公示名单；地址电话未在开放表发布，请以人社局最新公告为准。'
  })
}

// —— 4) inventory 状态刷新 ——
const invPath = path.join(OUT, 'open-data-inventory.json')
if (fs.existsSync(invPath)) {
  const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'))
  inv.updated = new Date().toISOString().slice(0, 10)
  const socialCat = inv.categories?.find((c) => c.id === 'social')
  if (socialCat) {
    const ensure = (id, file, tool_id, status, note) => {
      let d = socialCat.datasets.find((x) => x.id === id)
      if (!d) {
        d = { id, file, tool_id, status }
        socialCat.datasets.push(d)
      }
      d.file = file
      d.tool_id = tool_id
      d.status = status
      if (note) d.note = note
      delete d.masked_fields
    }
    ensure('injury-regions', '工伤保险统筹区划编码信息202508010106.xlsx', 'social-regions', 'ready')
    ensure(
      'skill-subsidy',
      '失业保险技能提升补贴经办机构信息202508010119.xlsx',
      'skill-subsidy',
      'ready',
      '电话脱敏；地址可用'
    )
    ensure(
      'edu-bases',
      '临沂市专业技术人员继续教育基地名单202508010106.xlsx',
      'edu-bases',
      'ready'
    )
    for (const id of ['training-orgs', 'ss-card-outlets']) {
      const d = socialCat.datasets.find((x) => x.id === id)
      if (d) {
        d.status = 'ready'
        delete d.masked_fields
      }
    }
  }
  const transit = inv.categories?.find((c) => c.id === 'transit')
  if (transit) {
    for (const id of ['freight-stations', 'passenger-stations', 'driving-schools']) {
      const d = transit.datasets.find((x) => x.id === id)
      if (d) {
        d.status = 'ready'
        delete d.masked_fields
      }
    }
  }
  writeJson('open-data-inventory.json', inv)
}

console.log('done')
