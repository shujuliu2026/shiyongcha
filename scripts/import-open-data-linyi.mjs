/**
 * 临沂开放网 xlsx 批次导入 → data/local/linyi/
 *
 * - 失业保险区划编码信息202508010115.xlsx
 * - 临沂市养老保险统筹区信息202508010116.xlsx
 * - 全市道路货运场站信息202508010315.xlsx（地址列脱敏）
 * - 职业培训机构目录202508040915.xlsx（电话/地址脱敏）
 *
 * 用法：node scripts/import-open-data-linyi.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'data', 'local', 'linyi')

function clean (s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isMasked (s) {
  const v = clean(s)
  if (!v) return false
  return /\*{2,}/.test(v) || v === '***' || /脱敏|已加密/.test(v)
}

/** 保留非 * 片段，便于联网检索 */
function maskHint (s) {
  return clean(String(s || '').replace(/\*+/g, ' '))
}

/**
 * @param {string|RegExp|Array<string|RegExp>} needles 按优先级匹配文件名
 */
function findXlsx (needles) {
  const list = Array.isArray(needles) ? needles : [needles]
  const dirs = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ROOT, d.name))
  const files = []
  for (const dir of [...dirs, path.join(ROOT, 'data'), ROOT]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.xlsx') || name.startsWith('~$')) continue
      files.push({ dir, name, full: path.join(dir, name) })
    }
  }
  for (const needle of list) {
    for (const f of files) {
      const ok =
        typeof needle === 'string'
          ? f.name.includes(needle)
          : needle.test(f.name)
      if (ok) return f.full
    }
  }
  return null
}

function sheetRows (src) {
  const wb = XLSX.readFile(src)
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}

function writeJson (file, payload) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const p = path.join(OUT_DIR, file)
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`OK ${file} · ${payload.count ?? payload.items?.length ?? '?'} · ${p}`)
  return p
}

// —— 1) 社保区划（失业 + 养老）——
const unempSrc = findXlsx(['失业保险区划编码信息202508010115', '失业保险区划编码'])
const pensionSrc = findXlsx(['临沂市养老保险统筹区信息202508010116', '养老保险统筹区'])
if (!unempSrc || !pensionSrc) {
  console.error('缺少失业/养老保险区划 xlsx')
  process.exit(1)
}

const unempRows = sheetRows(unempSrc).slice(1)
const pensionRows = sheetRows(pensionSrc).slice(1)

/** @type {Map<string, Record<string, unknown>>} */
const regionMap = new Map()
for (const r of unempRows) {
  const code = clean(r[1])
  const name = clean(r[2])
  if (!code) continue
  regionMap.set(code, {
    code,
    name,
    agency: clean(r[0]) || '社保经办机构',
    unemployment: true,
    pension: false
  })
}
for (const r of pensionRows) {
  const name = clean(r[0])
  const code = clean(r[1])
  const agency = clean(r[2]) || '社保经办机构'
  if (!code) continue
  const prev = regionMap.get(code) || { code, name, agency, unemployment: false, pension: false }
  regionMap.set(code, {
    ...prev,
    name: name || prev.name,
    agency: agency || prev.agency,
    pension: true
  })
}
const regions = [...regionMap.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)))
writeJson('social-regions.json', {
  city: '临沂',
  updated: '2025-08-01',
  category: 'social',
  category_label: '人社社保',
  source: {
    unemployment_file: path.basename(unempSrc),
    pension_file: path.basename(pensionSrc),
    publisher: '临沂市人力资源和社会保障局',
    portal: 'http://lydata.sd.gov.cn/'
  },
  count: regions.length,
  items: regions,
  disclaimer:
    '区划编码来自临沂开放网失业/养老保险公开表，办理业务请以社保经办机构现场公示为准。'
})

// —— 2) 货运场站 ——
const freightSrc = findXlsx(['全市道路货运场站信息202508010315', '道路货运场站', '202508010315'])
if (!freightSrc) {
  console.error('缺少全市道路货运场站信息 xlsx')
  process.exit(1)
}
const freightRows = sheetRows(freightSrc).slice(1)
const orgs = new Set()
const freightItems = []
for (let i = 0; i < freightRows.length; i++) {
  const r = freightRows[i]
  const name = clean(r[0])
  if (!name) continue
  const org = clean(r[1])
  const addressRaw = clean(r[2])
  const scope = clean(r[3])
  if (org) orgs.add(org)
  const masked = isMasked(addressRaw)
  freightItems.push({
    id: String(i + 1),
    name,
    org,
    scope,
    address_raw: addressRaw,
    address_masked: masked,
    address_hint: masked ? maskHint(addressRaw) : addressRaw,
    address: masked ? '' : addressRaw,
    address_source: masked ? '' : 'open_data',
    lat: null,
    lng: null
  })
}
writeJson('freight-stations.json', {
  city: '临沂',
  updated: '2025-08-01',
  category: 'transit',
  category_label: '出行交通',
  source: {
    file: path.basename(freightSrc),
    publisher: '临沂市交通运输局',
    portal: 'http://lydata.sd.gov.cn/'
  },
  orgs: [...orgs].sort((a, b) => a.localeCompare(b, 'zh')),
  count: freightItems.length,
  masked_address_count: freightItems.filter((x) => x.address_masked).length,
  enrich_hint: '第三列地址脱敏：配置 AMAP_WEB_KEY 后执行 npm run enrich:places -- freight',
  items: freightItems,
  disclaimer:
    '货运场站名录来自开放网普查表；地址列为脱敏数据，联网补全结果仅供参考，以现场与管辖机构为准。'
})

// —— 3) 职业培训机构 ——
// 勿误匹配「拟开展企业新型学徒制…职业培训机构目录」
const trainSrc = findXlsx([
  '职业培训机构目录202508040915',
  /^职业培训机构目录.*\.xlsx$/,
  '202508040915'
])
if (!trainSrc) {
  console.error('缺少职业培训机构目录 xlsx')
  process.exit(1)
}
const trainRows = sheetRows(trainSrc).slice(1)
const trainHeader = sheetRows(trainSrc)[0].map((h) => clean(h))
const trainingItems = []
for (let i = 0; i < trainRows.length; i++) {
  const r = trainRows[i]
  // 表头：序号 | 联系人 | 机构名称 | 联系电话 | 地址
  let seq = clean(r[0])
  let contact = clean(r[1])
  let name = clean(r[2])
  let phoneRaw = clean(r[3])
  let addressRaw = clean(r[4])
  // 兼容误表：单位名称 | 单位地址 | 负责人 | 序号
  if (trainHeader[0] === '单位名称' || (!name && clean(r[0]))) {
    name = clean(r[0])
    addressRaw = clean(r[1])
    contact = clean(r[2])
    seq = clean(r[3]) || String(i + 1)
    phoneRaw = ''
  }
  if (!name) continue
  const phoneMasked = isMasked(phoneRaw)
  const addressMasked = isMasked(addressRaw)
  trainingItems.push({
    id: String(seq || i + 1),
    name,
    contact,
    phone_raw: phoneRaw,
    phone_masked: phoneMasked,
    phone: phoneMasked ? '' : phoneRaw,
    address_raw: addressRaw,
    address_masked: addressMasked,
    address_hint: addressMasked ? maskHint(addressRaw) : addressRaw,
    address: addressMasked ? '' : addressRaw,
    address_source: addressMasked ? '' : 'open_data',
    lat: null,
    lng: null
  })
}
writeJson('training-orgs.json', {
  city: '临沂',
  updated: '2025-08-04',
  category: 'social',
  category_label: '人社社保',
  source: {
    file: path.basename(trainSrc),
    publisher: '临沂市人力资源和社会保障局',
    portal: 'http://lydata.sd.gov.cn/',
    gov_directories: [
      'http://www.lyls.gov.cn/info/7308/286768.htm',
      'https://www.yishui.gov.cn/info/129549/438744.htm',
      'http://www.linshu.gov.cn/info/5216/268754.htm'
    ]
  },
  count: trainingItems.length,
  masked_address_count: trainingItems.filter((x) => x.address_masked).length,
  masked_phone_count: trainingItems.filter((x) => x.phone_masked).length,
  enrich_hint: '电话/地址脱敏：配置 AMAP_WEB_KEY 后执行 npm run enrich:places -- training',
  items: trainingItems,
  disclaimer:
    '机构名录来自开放网职业培训目录；联系电话与地址多为脱敏字段，联网补全或各区县公告为准。'
})

// —— 4) 社保卡即时制卡网点（优先汇总表，再合并各行表）——
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

function parseSsCardRows (src, bankHint = '') {
  const rows = sheetRows(src)
  const header = rows[0].map((h) => clean(h))
  const idx = {
    name: header.findIndex((h) => /名称/.test(h)),
    address: header.findIndex((h) => /地址/.test(h)),
    phone: header.findIndex((h) => /联系/.test(h)),
    seq: header.findIndex((h) => /序号/.test(h))
  }
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[idx.name >= 0 ? idx.name : 0])
    if (!name) continue
    const addressRaw = clean(r[idx.address >= 0 ? idx.address : 1])
    const phoneRaw = clean(r[idx.phone >= 0 ? idx.phone : 2])
    const maskedA = isMasked(addressRaw)
    const maskedP = isMasked(phoneRaw)
    out.push({
      id: `${path.basename(src)}-${i}`,
      name,
      bank: inferBank(name, bankHint || path.basename(src)),
      phone_raw: phoneRaw,
      phone_masked: maskedP,
      phone: maskedP ? '' : phoneRaw,
      address_raw: addressRaw,
      address_masked: maskedA,
      address_hint: maskedA ? maskHint(addressRaw) : addressRaw,
      address: maskedA ? '' : addressRaw,
      address_source: maskedA ? '' : 'open_data',
      lat: null,
      lng: null,
      source_file: path.basename(src)
    })
  }
  return out
}

const ssMain = findXlsx(['临沂市社保卡即时制卡网点202508040917', '临沂市社保卡即时制卡网点'])
const ssBankFiles = [
  findXlsx(['中国银行社保卡即时制卡网点', '中国银行社保卡']),
  findXlsx(['农业银行社保卡即时制卡网点', '农业银行社保卡']),
  findXlsx(['农商银行社保卡即时制卡网点', '农商银行社保卡']),
  findXlsx(['工商银行社保卡即时制卡网点', '工商银行社保卡'])
].filter(Boolean)

/** @type {Map<string, Record<string, unknown>>} */
const ssMap = new Map()
if (ssMain) {
  for (const it of parseSsCardRows(ssMain, '汇总')) {
    ssMap.set(it.name, it)
  }
}
for (const src of ssBankFiles) {
  for (const it of parseSsCardRows(src)) {
    const prev = ssMap.get(it.name)
    if (!prev) {
      ssMap.set(it.name, it)
      continue
    }
    // 合并：保留已有地址/电话，补全 bank
    if (!prev.bank || prev.bank === '其他') prev.bank = it.bank
    if (!prev.address && it.address) prev.address = it.address
    if (!prev.phone && it.phone) prev.phone = it.phone
    if (!prev.address_hint && it.address_hint) prev.address_hint = it.address_hint
  }
}
const ssItems = [...ssMap.values()].sort((a, b) =>
  String(a.bank).localeCompare(String(b.bank), 'zh') || String(a.name).localeCompare(String(b.name), 'zh')
)
const ssBanks = [...new Set(ssItems.map((x) => x.bank))].sort((a, b) => a.localeCompare(b, 'zh'))
writeJson('ss-card-outlets.json', {
  city: '临沂',
  updated: '2025-08-04',
  category: 'social',
  category_label: '人社社保',
  source: {
    files: [ssMain, ...ssBankFiles].filter(Boolean).map((p) => path.basename(p)),
    publisher: '临沂市人力资源和社会保障局 / 各承办银行',
    portal: 'http://lydata.sd.gov.cn/'
  },
  banks: ssBanks,
  count: ssItems.length,
  masked_address_count: ssItems.filter((x) => x.address_masked).length,
  enrich_hint: '地址/电话脱敏：npm run enrich:places -- ss-card',
  items: ssItems,
  disclaimer: '社保卡即时制卡网点名录来自开放网；电话与地址多为脱敏，办理前请电话确认网点营业状态。'
})

// —— 5) 道路客运场站 ——
const passengerSrc = findXlsx(['道路运输客运场站信息202508010106', '道路运输客运场站', '客运场站信息'])
if (passengerSrc) {
  const rows = sheetRows(passengerSrc).slice(1)
  const items = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[0])
    if (!name) continue
    const scope = clean(r[1])
    const addressRaw = clean(r[2])
    const masked = isMasked(addressRaw)
    items.push({
      id: String(i + 1),
      name,
      scope,
      address_raw: addressRaw,
      address_masked: masked,
      address_hint: masked ? maskHint(addressRaw) : addressRaw,
      address: masked ? '' : addressRaw,
      address_source: masked ? '' : 'open_data',
      lat: null,
      lng: null
    })
  }
  writeJson('passenger-stations.json', {
    city: '临沂',
    updated: '2025-08-01',
    category: 'transit',
    category_label: '出行交通',
    source: {
      file: path.basename(passengerSrc),
      publisher: '临沂市交通运输局',
      portal: 'http://lydata.sd.gov.cn/'
    },
    count: items.length,
    masked_address_count: items.filter((x) => x.address_masked).length,
    enrich_hint: '地址脱敏：npm run enrich:places -- passenger',
    items,
    disclaimer: '客运场站名录来自开放网；地址脱敏字段需联网补全，出行请以车站公告为准。'
  })
}

// —— 6) 驾校（一/二/三级）——
function parseDriving (src, level) {
  const rows = sheetRows(src)
  const header = rows[0].map((h) => clean(h))
  const idx = {
    name: header.findIndex((h) => h === '名称'),
    address: header.findIndex((h) => h === '地址'),
    org: header.findIndex((h) => /管辖/.test(h)),
    scope: header.findIndex((h) => /经营范围/.test(h))
  }
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[idx.name])
    if (!name) continue
    const addressRaw = clean(r[idx.address])
    const masked = isMasked(addressRaw)
    out.push({
      id: `${level}-${i}`,
      name,
      level,
      org: clean(r[idx.org]),
      scope: clean(r[idx.scope]),
      address_raw: addressRaw,
      address_masked: masked,
      address_hint: masked ? maskHint(addressRaw) : addressRaw,
      address: masked ? '' : addressRaw,
      address_source: masked ? '' : 'open_data',
      lat: null,
      lng: null
    })
  }
  return out
}

const drive1 = findXlsx(['一级普通机动车驾驶员培训机构信息', '一级普通机动车驾驶员'])
const drive2 = findXlsx(['二级普通机动车驾驶员培训机构信息', '二级普通机动车驾驶员'])
const drive3 = findXlsx(['三级普通机动车驾驶员培训机构信息', '三级普通机动车驾驶员'])
const driveItems = [
  ...(drive1 ? parseDriving(drive1, '一级') : []),
  ...(drive2 ? parseDriving(drive2, '二级') : []),
  ...(drive3 ? parseDriving(drive3, '三级') : [])
]
if (driveItems.length) {
  writeJson('driving-schools.json', {
    city: '临沂',
    updated: '2025-08-01',
    category: 'transit',
    category_label: '出行交通',
    source: {
      files: [drive1, drive2, drive3].filter(Boolean).map((p) => path.basename(p)),
      publisher: '临沂市交通运输局',
      portal: 'http://lydata.sd.gov.cn/'
    },
    levels: ['一级', '二级', '三级'],
    count: driveItems.length,
    masked_address_count: driveItems.filter((x) => x.address_masked).length,
    enrich_hint: '地址脱敏：npm run enrich:places -- driving',
    items: driveItems,
    disclaimer: '驾校名录来自开放网一/二/三级驾驶员培训机构表；地址多为脱敏，报名请现场核实资质与训练场。'
  })
}

// —— 清单（分类说明）——
writeJson('open-data-inventory.json', {
  updated: new Date().toISOString().slice(0, 10),
  categories: [
    {
      id: 'social',
      label: '人社社保',
      datasets: [
        { id: 'unemployment-regions', file: path.basename(unempSrc), tool_id: 'social-regions', status: 'ready' },
        { id: 'pension-regions', file: path.basename(pensionSrc), tool_id: 'social-regions', status: 'ready' },
        {
          id: 'training-orgs',
          file: path.basename(trainSrc),
          tool_id: 'training-orgs',
          status: 'needs_enrich',
          masked_fields: ['联系电话', '地址']
        },
        {
          id: 'ss-card-outlets',
          file: ssMain ? path.basename(ssMain) : '（多银行分表）',
          tool_id: 'ss-card',
          status: 'needs_enrich',
          masked_fields: ['联系方式', '地址'],
          note: `合并 ${ssItems.length} 处即时制卡网点`
        }
      ]
    },
    {
      id: 'transit',
      label: '出行交通',
      datasets: [
        {
          id: 'freight-stations',
          file: path.basename(freightSrc),
          tool_id: 'freight-stations',
          status: 'needs_enrich',
          masked_fields: ['地址']
        },
        {
          id: 'passenger-stations',
          file: passengerSrc ? path.basename(passengerSrc) : '',
          tool_id: 'passenger-stations',
          status: 'needs_enrich',
          masked_fields: ['地址']
        },
        {
          id: 'driving-schools',
          file: '一/二/三级普通机动车驾驶员培训机构',
          tool_id: 'driving-schools',
          status: 'needs_enrich',
          masked_fields: ['地址'],
          note: `${driveItems.length} 家`
        },
        { id: 'bus-ic', file: '临沂市公交集团公交IC卡办理网点202508010248.xlsx', tool_id: 'bus-ic', status: 'ready' },
        { id: 'bus-shelters', file: '临沂市公交站亭普查信息202508010320.xlsx', tool_id: 'bus-shelters', status: 'ready' }
      ]
    },
    {
      id: 'agriculture',
      label: '农业行情（暂未上架）',
      datasets: [
        { id: 'veg-prod', file: '临沂市分县区蔬菜（含菜用瓜）生产情况202508010154.xlsx', tool_id: null, status: 'pending' },
        { id: 'grain-summer', file: '临沂市分县区夏收粮食生产情况202508010159.xlsx', tool_id: null, status: 'pending' },
        { id: 'grain-autumn', file: '临沂市分县区秋收粮食生产情况202508010201.xlsx', tool_id: null, status: 'pending' }
      ]
    }
  ]
})

console.log('done')

