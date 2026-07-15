/**
 * 实用查 · API / 数据源登记册
 * 默认条目 + data/ops/data-sources.json 运营覆盖（手动更新时间、备注、启用）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OPS_FILE = path.join(ROOT, 'data/ops/data-sources.json')

/**
 * update_mode:
 * - realtime  请求时实时拉取（或短缓存），标注「实时」
 * - scheduled 上游定期发布，本站自动拉取，标注「自动」
 * - manual    本地静态/种子，需人工维护，标注「手动」
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   tool_ids: string[],
 *   kind: 'api'|'static'|'seed'|'algo',
 *   update_mode: 'realtime'|'scheduled'|'manual',
 *   endpoint?: string|null,
 *   portal?: string|null,
 *   env_keys?: string[],
 *   file_path?: string|null,
 *   note?: string
 * }} SourceDef
 */

/** @type {SourceDef[]} */
export const DEFAULT_DATA_SOURCES = [
  // —— 实时 API ——
  {
    id: 'open-meteo-forecast',
    title: 'Open-Meteo 一周预报',
    tool_ids: ['local-weather'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://api.open-meteo.com/v1/forecast',
    portal: 'https://open-meteo.com/',
    note: '临沂天气主数据源，免 Key'
  },
  {
    id: 'open-meteo-aqi',
    title: 'Open-Meteo 空气质量预报',
    tool_ids: ['aqi'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    portal: 'https://open-meteo.com/en/docs/air-quality-api',
    note: 'AQI 页备选预报源'
  },
  {
    id: 'zj-slt-typhoon-activity',
    title: '浙江水利厅台风活动',
    tool_ids: ['weather', 'local-weather'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://typhoon.slt.zj.gov.cn/Api/TyhoonActivity',
    portal: 'https://typhoon.slt.zj.gov.cn/',
    note: '活跃台风列表'
  },
  {
    id: 'zj-slt-typhoon-detail',
    title: '浙江水利厅台风路径详情',
    tool_ids: ['weather'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://typhoon.slt.zj.gov.cn/Api/TyphoonInfo/{tfid}',
    portal: 'https://typhoon.slt.zj.gov.cn/',
    note: '单台风路径与预报轨迹'
  },
  {
    id: 'rainviewer-maps',
    title: 'RainViewer 降水雷达',
    tool_ids: ['weather'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://api.rainviewer.com/public/weather-maps.json',
    portal: 'https://www.rainviewer.com/api.html',
    note: '雨层帧元数据；瓦片 tilecache.rainviewer.com'
  },
  {
    id: 'sd-open-air',
    title: '山东开放网 · 环境空气质量',
    tool_ids: ['aqi'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://data.sd.gov.cn/gateway/api/1/air_station_hourfy',
    portal: 'https://data.sd.gov.cn/portal/api/fc2e1c604c1a4e80a42a86bd9f12677d/detail',
    env_keys: ['SD_OPEN_CLIENT_ID', 'SD_OPEN_CLIENT_SECRET'],
    note: '国控站小时级；需申请接口权限'
  },
  {
    id: 'sd-open-precip',
    title: '山东开放网 · 109 站降水量',
    tool_ids: ['precip'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://data.sd.gov.cn/gateway/api/1/sdsjslsj',
    portal: 'https://data.sd.gov.cn/portal/catalog/20181203192046100500',
    env_keys: ['SD_OPEN_CLIENT_ID', 'SD_OPEN_CLIENT_SECRET'],
    note: '历史站网样本（非预报）'
  },
  {
    id: 'wolfx-cenc-eqlist',
    title: 'Wolfx · 中国地震台网列表',
    tool_ids: ['earthquake'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://api.wolfx.jp/cenc_eqlist.json',
    portal: 'https://api.wolfx.jp/',
    note: '第三方聚合，非官方预警'
  },
  {
    id: 'wolfx-cenc-eew',
    title: 'Wolfx · 地震预警试推',
    tool_ids: ['earthquake'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://api.wolfx.jp/cenc_eew.json',
    portal: 'https://api.wolfx.jp/',
    note: '试推展示，非正式 EEW'
  },
  {
    id: 'juhe-interbank',
    title: '聚合数据 · 联行号查询',
    tool_ids: ['bank', 'bank-batch'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://apis.juhe.cn/interbank/query',
    portal: 'https://www.juhe.cn/docs/api/id/229',
    env_keys: ['JUHE_INTERBANK_KEY'],
    note: '可选；本地全量未命中时可回落'
  },
  {
    id: 'lydata-bus-gps',
    title: '临沂开放网 · 公交 GPS',
    tool_ids: ['bus'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'http://lydata.sd.gov.cn/gateway/api/1/gjcGPSjzdsjxx',
    portal: 'http://lydata.sd.gov.cn/linyi/api/2b8a60ca4d124610a590ff56b6e56033/detail',
    env_keys: ['LYDATA_CLIENT_ID'],
    note: '短缓存实时车辆位置'
  },
  {
    id: 'amap-place-text',
    title: '高德 · POI 地理编码',
    tool_ids: ['local-bank'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://restapi.amap.com/v3/place/text',
    portal: 'https://console.amap.com/dev/key/app',
    env_keys: ['AMAP_WEB_KEY'],
    note: '本地银行网点精定位'
  },
  {
    id: 'nominatim-search',
    title: 'OSM Nominatim 地理编码',
    tool_ids: ['local-bank'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://nominatim.openstreetmap.org/search',
    portal: 'https://nominatim.org/',
    note: '无高德 Key 时回落'
  },
  {
    id: 'carto-basemap',
    title: 'Carto / OSM 地图底图',
    tool_ids: ['weather', 'local-bank'],
    kind: 'api',
    update_mode: 'realtime',
    endpoint: 'https://{s}.basemaps.cartocdn.com/...',
    portal: 'https://carto.com/basemaps/',
    note: 'Leaflet 底图瓦片'
  },

  // —— 上游定期、本站自动 ——
  {
    id: 'mofcom-cif-agri-price',
    title: '商务部商务预报 · 菜蛋肉批发价',
    tool_ids: ['price'],
    kind: 'api',
    update_mode: 'scheduled',
    endpoint: 'https://cif.mofcom.gov.cn/cif/seach.fhtml?commdityid={id}',
    portal: 'https://cif.mofcom.gov.cn/',
    note: '日度批发监测；本站约 10 分钟缓存自动拉取'
  },

  // —— 需手动维护 ——
  {
    id: 'oil-prices-json',
    title: '山东油价参考 JSON',
    tool_ids: ['oil'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/national/oil-prices.json',
    portal: null,
    note: '最高零售价整理；调价窗口后需人工改 JSON'
  },
  {
    id: 'holidays-json',
    title: '节假日与调休 JSON',
    tool_ids: ['holidays'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/national/holidays.json',
    portal: 'https://www.gov.cn/',
    note: '每年国务院放假安排发布后更新'
  },
  {
    id: 'id-regions-json',
    title: '身份证区划码表',
    tool_ids: ['id-region'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/national/id-regions.json',
    portal: 'https://github.com/modood/Administrative-divisions-of-China',
    note: '区划调整时同步码表'
  },
  {
    id: 'history-today-json',
    title: '临沂历史上的今天',
    tool_ids: ['history-today'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/history-today.json',
    note: '地方史条目人工增补'
  },
  {
    id: 'hospitals-json',
    title: '临沂医院速查',
    tool_ids: ['hospitals'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/hospitals.json',
    note: '电话/地址变更时更新'
  },
  {
    id: 'hotlines-json',
    title: '临沂便民电话',
    tool_ids: ['hotlines'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/hotlines.json',
    note: '热线号码变更时更新'
  },
  {
    id: 'districts-json',
    title: '临沂区划与邮编',
    tool_ids: ['districts'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/districts.json',
    note: '区划/邮编调整时更新'
  },
  {
    id: 'guides-json',
    title: '临沂办事指南',
    tool_ids: ['guides'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/guides.json',
    note: '办事入口说明人工维护'
  },
  {
    id: 'transit-json',
    title: '临沂出行提示',
    tool_ids: ['transit'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/transit.json',
    note: '机场/高铁/客运站信息'
  },
  {
    id: 'bus-ic-outlets-json',
    title: '临沂公交IC卡办理网点',
    tool_ids: ['bus-ic'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/bus-ic-outlets.json',
    portal: 'http://lydata.sd.gov.cn/',
    note: '从开放网 xlsx 导入：npm run import:bus-ic'
  },
  {
    id: 'bus-shelters-json',
    title: '临沂公交站亭普查',
    tool_ids: ['bus-shelters'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/bus-shelters.json',
    portal: 'http://lydata.sd.gov.cn/',
    note: '取第一列位置；npm run import:bus-shelters'
  },
  {
    id: 'social-regions-json',
    title: '临沂社保区划编码',
    tool_ids: ['social-regions'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/social-regions.json',
    portal: 'http://lydata.sd.gov.cn/',
    note: '失业+养老区划；npm run import:open-data'
  },
  {
    id: 'freight-stations-json',
    title: '临沂道路货运场站',
    tool_ids: ['freight-stations'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/freight-stations.json',
    portal: 'http://lydata.sd.gov.cn/',
    env_keys: ['AMAP_WEB_KEY'],
    note: '地址脱敏；npm run enrich:places -- freight'
  },
  {
    id: 'training-orgs-json',
    title: '临沂职业培训机构目录',
    tool_ids: ['training-orgs'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/local/linyi/training-orgs.json',
    portal: 'http://lydata.sd.gov.cn/',
    env_keys: ['AMAP_WEB_KEY'],
    note: '电话/地址脱敏；npm run enrich:places -- training'
  },
  {
    id: 'official-nav-links',
    title: '官方信息查询外链导航',
    tool_ids: ['official-nav'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'apps/web/src/data/officialNav.js',
    portal: 'https://www.chsi.com.cn/',
    note: '学信/征信等外链；URL 失效时改前端清单'
  },
  {
    id: 'cnaps-full-jsonl',
    title: '联行号全量库',
    tool_ids: ['bank', 'bank-batch', 'local-bank'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/cnaps-full.jsonl',
    note: '从 Excel 导入：npm run import:cnaps'
  },
  {
    id: 'cnaps-seed-json',
    title: '联行号种子库',
    tool_ids: ['bank', 'bank-batch', 'local-bank'],
    kind: 'seed',
    update_mode: 'manual',
    file_path: 'data/cnaps-seed.json',
    note: '全量未导入时的回落子集'
  },
  {
    id: 'linyi-bank-geo-cache',
    title: '临沂银行网点坐标缓存',
    tool_ids: ['local-bank'],
    kind: 'static',
    update_mode: 'manual',
    file_path: 'data/linyi-bank-geo.json',
    env_keys: ['AMAP_WEB_KEY'],
    note: 'npm run geocode:linyi-banks 批量补点'
  },
  {
    id: 'coord-convert-algo',
    title: '坐标系互转算法',
    tool_ids: ['coord'],
    kind: 'algo',
    update_mode: 'realtime',
    file_path: 'packages/shared/coord-convert.mjs',
    note: '本地算法，无需外网；标为实时可用'
  }
]

const UPDATE_LABEL = {
  realtime: '实时',
  scheduled: '自动',
  manual: '手动'
}

function ensureOpsDir () {
  fs.mkdirSync(path.dirname(OPS_FILE), { recursive: true })
}

function readOverrides () {
  try {
    if (!fs.existsSync(OPS_FILE)) return { items: {}, updated_at: null }
    const raw = JSON.parse(fs.readFileSync(OPS_FILE, 'utf8'))
    const items = raw && typeof raw.items === 'object' && raw.items ? raw.items : {}
    return { items, updated_at: raw.updated_at || null }
  } catch {
    return { items: {}, updated_at: null }
  }
}

function writeOverrides (doc) {
  ensureOpsDir()
  fs.writeFileSync(OPS_FILE, JSON.stringify(doc, null, 2), 'utf8')
}

function envConfigured (keys = []) {
  if (!keys.length) return null
  const present = keys.filter((k) => String(process.env[k] || '').trim())
  return {
    required: keys,
    present,
    ok: present.length === keys.length
  }
}

function fileExists (rel) {
  if (!rel) return null
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel)
  try {
    return fs.existsSync(abs)
  } catch {
    return false
  }
}

/**
 * @param {{ mode?: string, q?: string }} [opts]
 */
export function listDataSources (opts = {}) {
  const { items: ovMap, updated_at } = readOverrides()
  const mode = String(opts.mode || '').trim()
  const q = String(opts.q || '').trim().toLowerCase()

  let list = DEFAULT_DATA_SOURCES.map((base) => {
    const ov = ovMap[base.id] || {}
    const update_mode = base.update_mode
    const enabled = ov.enabled === undefined ? true : Boolean(ov.enabled)
    return {
      ...base,
      enabled,
      update_label: UPDATE_LABEL[update_mode] || update_mode,
      is_realtime: update_mode === 'realtime',
      needs_manual: update_mode === 'manual',
      last_manual_at: ov.last_manual_at || null,
      last_manual_note: ov.last_manual_note || '',
      ops_note: ov.ops_note || '',
      env: envConfigured(base.env_keys || []),
      file_exists: fileExists(base.file_path || null)
    }
  })

  if (mode === 'realtime') list = list.filter((s) => s.update_mode === 'realtime')
  else if (mode === 'scheduled') list = list.filter((s) => s.update_mode === 'scheduled')
  else if (mode === 'manual') list = list.filter((s) => s.update_mode === 'manual')

  if (q) {
    list = list.filter((s) => {
      const hay = `${s.id} ${s.title} ${s.note || ''} ${(s.tool_ids || []).join(' ')} ${s.endpoint || ''} ${s.portal || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const counts = {
    total: DEFAULT_DATA_SOURCES.length,
    realtime: DEFAULT_DATA_SOURCES.filter((s) => s.update_mode === 'realtime').length,
    scheduled: DEFAULT_DATA_SOURCES.filter((s) => s.update_mode === 'scheduled').length,
    manual: DEFAULT_DATA_SOURCES.filter((s) => s.update_mode === 'manual').length
  }

  return {
    sources: list,
    counts,
    updated_at,
    legend: {
      realtime: '实时：每次查询拉取（或短缓存）',
      scheduled: '自动：上游定期发布，本站自动抓取',
      manual: '手动：本地静态/种子，改完后请点「标记已更新」'
    }
  }
}

/**
 * @param {string} id
 * @param {{ enabled?: boolean, ops_note?: string, last_manual_note?: string, touch?: boolean }} patch
 */
export function patchDataSource (id, patch = {}) {
  const base = DEFAULT_DATA_SOURCES.find((s) => s.id === id)
  if (!base) {
    const err = new Error('source_not_found')
    err.status = 404
    throw err
  }
  const doc = readOverrides()
  const cur = { ...(doc.items[id] || {}) }
  if (patch.enabled !== undefined) cur.enabled = Boolean(patch.enabled)
  if (typeof patch.ops_note === 'string') cur.ops_note = patch.ops_note.trim().slice(0, 300)
  if (typeof patch.last_manual_note === 'string') {
    cur.last_manual_note = patch.last_manual_note.trim().slice(0, 200)
  }
  if (patch.touch) {
    cur.last_manual_at = new Date().toISOString()
    if (!cur.last_manual_note && typeof patch.last_manual_note !== 'string') {
      cur.last_manual_note = '已手动更新'
    }
  }
  doc.items[id] = cur
  doc.updated_at = new Date().toISOString()
  writeOverrides(doc)
  return listDataSources()
}

export function touchDataSource (id, note = '') {
  return patchDataSource(id, {
    touch: true,
    last_manual_note: note || undefined
  })
}
