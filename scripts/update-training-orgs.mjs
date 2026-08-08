/**
 * 从 职业培训机构目录202508040915.xlsx 刷新并补充机构信息
 * - 保留已有高德补全地址
 * - 写入公开渠道补充的地址/电话/别名/区县
 * - 缺失地址再走高德
 *
 * 用法：node scripts/update-training-orgs.mjs
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
const OUT = path.join(ROOT, 'data/local/linyi/training-orgs.json')

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
  const v = clean(s)
  return /\*{2,}/.test(v) || v === '***'
}

function maskHint (s) {
  return clean(String(s || '').replace(/\*+/g, ' '))
}

function findXlsx () {
  const dirs = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ROOT, d.name))
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (name.includes('职业培训机构目录202508040915') && name.endsWith('.xlsx')) {
        return path.join(dir, name)
      }
    }
  }
  return null
}

const DISTRICTS = [
  '兰山区',
  '罗庄区',
  '河东区',
  '沂南县',
  '郯城县',
  '沂水县',
  '兰陵县',
  '费县',
  '平邑县',
  '莒南县',
  '蒙阴县',
  '临沭县',
  '高新区',
  '经开区',
  '临港区',
  '蒙山旅游区'
]

function inferDistrict (...texts) {
  const blob = texts.filter(Boolean).join(' ')
  for (const d of DISTRICTS) {
    if (blob.includes(d)) return d
  }
  if (/北城|南坊/.test(blob)) return '兰山区'
  if (/经济技术开发区|经开/.test(blob)) return '经开区'
  if (/高新技术产业开发区|高新/.test(blob)) return '高新区'
  return ''
}

/** 公开渠道补充（非开放网字段；标明来源） */
const SUPPLEMENTS = {
  临沂市齐鲁长城技术学校: {
    alias: '临沂长城职业中等专业学校',
    district: '河东区',
    address: '临沂市河东区金雀山东路东段（河东汽车站向东约1000–1500米路北）',
    phone: '0539-8082785',
    phone_source: 'hedong_gov',
    address_source: 'public_listing',
    note: '与长城职业中专为同一办学实体；河东区政府公开栏目备案联系方式',
    geocode_query: '临沂长城职业中等专业学校 金雀山东路'
  },
  山东交通技师学院: {
    district: '兰山区',
    geocode_query: '山东交通技师学院 中丘路'
  },
  临沂创业大学: {
    alias: '临沂创大职业培训学校',
    district: '兰山区'
  }
}

const src = findXlsx()
if (!src) {
  console.error('未找到 职业培训机构目录202508040915.xlsx')
  process.exit(1)
}

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [] }
/** @type {Map<string, any>} */
const prevByName = new Map((prev.items || []).map((it) => [it.name, it]))

const wb = XLSX.readFile(src)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const items = []

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const seq = clean(r[0])
  const contact = clean(r[1])
  const name = clean(r[2])
  const phoneRaw = clean(r[3])
  const addressRaw = clean(r[4])
  if (!name) continue

  const old = prevByName.get(name) || {}
  const sup = SUPPLEMENTS[name] || {}
  const phoneMasked = isMasked(phoneRaw)
  const addressMasked = isMasked(addressRaw)

  const item = {
    id: String(seq || i),
    name,
    alias: sup.alias || old.alias || '',
    contact,
    district: '',
    phone_raw: phoneRaw,
    phone_masked: phoneMasked,
    phone: '',
    phone_source: '',
    address_raw: addressRaw,
    address_masked: addressMasked,
    address_hint: addressMasked ? maskHint(addressRaw) : addressRaw,
    address: '',
    address_source: '',
    note: sup.note || old.note || '',
    lat: null,
    lng: null,
    name_matched: '',
    enriched_at: ''
  }

  // 1) 公开补充优先于脱敏空字段
  if (sup.phone) {
    item.phone = sup.phone
    item.phone_source = sup.phone_source || 'public_listing'
  } else if (old.phone && !old.phone_masked) {
    item.phone = old.phone
    item.phone_source = old.phone_source || 'previous'
  } else if (!phoneMasked && phoneRaw) {
    item.phone = phoneRaw
    item.phone_source = 'open_data'
  }

  if (sup.address) {
    item.address = sup.address
    item.address_source = sup.address_source || 'public_listing'
  } else if (old.address && old.address_source && old.address_source !== '') {
    item.address = old.address
    item.address_source = old.address_source
    item.lat = old.lat ?? null
    item.lng = old.lng ?? null
    item.name_matched = old.name_matched || ''
    item.enriched_at = old.enriched_at || ''
  } else if (!addressMasked && addressRaw) {
    item.address = addressRaw
    item.address_source = 'open_data'
  }

  item.district =
    sup.district ||
    old.district ||
    inferDistrict(item.address, item.address_hint, item.address_raw, name)

  if (sup.geocode_query) item.geocode_query = sup.geocode_query

  items.push(item)
}

// 补全仍缺地址的机构
let geoOk = 0
let geoFail = 0
if (amapConfigured()) {
  for (const it of items) {
    if (it.address && it.lat != null) continue
    if (it.address && it.address_source === 'public_listing' && it.lat == null) {
      // 有公开地址尚无坐标 → 再编码
    } else if (it.address) {
      continue
    }

    const queries = [
      it.geocode_query,
      `${it.name} ${it.district || ''}`.trim(),
      it.name,
      `${it.alias} ${it.district || ''}`.trim(),
      `临沂 ${it.address_hint || ''}`.trim()
    ].filter(Boolean)

    let hit = null
    for (const q of queries) {
      try {
        await new Promise((r) => setTimeout(r, 320))
        hit = await geocodeAmap(q, '临沂')
        if (hit?.address || hit?.name_matched) break
      } catch {
        hit = null
      }
    }
    if (hit) {
      if (!it.address) {
        it.address = [hit.name_matched, hit.address].filter(Boolean).join(' · ') || hit.address
        it.address_source = 'amap'
      }
      it.lat = hit.lat
      it.lng = hit.lng
      it.name_matched = hit.name_matched || ''
      it.enriched_at = hit.updated_at
      if (!it.district) it.district = inferDistrict(it.address, hit.address, hit.name_matched)
      geoOk++
      console.log('GEO', it.name, '→', it.address.slice(0, 50))
    } else {
      geoFail++
      console.warn('GEO_FAIL', it.name)
    }
  }
} else {
  console.warn('未配置 AMAP_WEB_KEY，跳过地理编码')
}

const districts = [...new Set(items.map((x) => x.district).filter(Boolean))].sort((a, b) =>
  a.localeCompare(b, 'zh')
)

const payload = {
  city: '临沂',
  updated: new Date().toISOString().slice(0, 10),
  category: 'social',
  category_label: '人社社保',
  source: {
    file: path.basename(src),
    publisher: '临沂市人力资源和社会保障局',
    portal: 'http://lydata.sd.gov.cn/',
    gov_directories: [
      'http://www.lyls.gov.cn/info/7308/286768.htm',
      'https://www.yishui.gov.cn/info/129549/438744.htm',
      'http://www.linshu.gov.cn/info/5216/268754.htm',
      'http://www.hedong.gov.cn/'
    ],
    supplements: '部分地址/电话来自区县政府公开栏或办学公开信息，已标注 source'
  },
  districts,
  count: items.length,
  masked_address_count: items.filter((x) => x.address_masked && !x.address).length,
  masked_phone_count: items.filter((x) => !x.phone).length,
  enriched_ok: items.filter((x) => x.address && x.address_source && x.address_source !== 'open_data').length,
  enriched_at: new Date().toISOString(),
  enrich_hint: '电话可用 npm run enrich:training-phones 经高德补全；地址已尽量联网/公开渠道补全',
  items,
  disclaimer:
    '机构名录以开放网《职业培训机构目录》为准；电话/地址经联网或公开渠道补充，可能滞后，报名/办班请以机构与人社部门公示为准。'
}

// strip helper field
for (const it of payload.items) delete it.geocode_query

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
console.log(
  `OK ${items.length} → ${OUT} · districts ${districts.length} · geo+${geoOk}/fail ${geoFail} · with_phone ${items.filter((x) => x.phone).length} · with_addr ${items.filter((x) => x.address).length}`
)
