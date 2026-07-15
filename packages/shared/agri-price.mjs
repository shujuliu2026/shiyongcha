/**
 * 农产品批发价 · 商务部「商务预报」日度监测（cif.mofcom.gov.cn）
 * 鸡蛋 / 肉类 / 蔬菜 · 服务端解析 HTML · 短缓存
 */
const CIF_BASE = 'https://cif.mofcom.gov.cn/cif/seach.fhtml'
const UA =
  'Mozilla/5.0 (compatible; shiyongcha-agri-price/1.0)'

/** @type {Record<string, { label: string, products: Array<{ id: string, name: string }> }>} */
export const PRICE_CATEGORIES = {
  egg: {
    label: '鸡蛋',
    products: [{ id: '150010', name: '鲜鸡蛋' }]
  },
  meat: {
    label: '肉类',
    products: [
      { id: '130010', name: '鲜猪肉' },
      { id: '130011', name: '白条肉' },
      { id: '130014', name: '后臀尖' },
      { id: '130020', name: '鲜牛肉' },
      { id: '130025', name: '牛腿肉' },
      { id: '130035', name: '羊腿肉' },
      { id: '280020', name: '白条鸡' },
      { id: '280050', name: '白条鸭' }
    ]
  },
  veg: {
    label: '蔬菜',
    products: [
      { id: '170060', name: '大白菜' },
      { id: '170010', name: '圆白菜' },
      { id: '170020', name: '油菜' },
      { id: '170040', name: '芹菜' },
      { id: '170050', name: '生菜' },
      { id: '170480', name: '韭菜' },
      { id: '170130', name: '黄瓜' },
      { id: '170120', name: '西红柿' },
      { id: '170140', name: '茄子' },
      { id: '170160', name: '青椒' },
      { id: '170150', name: '尖椒' },
      { id: '170080', name: '土豆' },
      { id: '170070', name: '白萝卜' },
      { id: '170260', name: '胡萝卜' },
      { id: '170090', name: '洋葱' },
      { id: '170250', name: '大葱' },
      { id: '170100', name: '蒜头' },
      { id: '170110', name: '生姜' },
      { id: '170270', name: '莲藕' },
      { id: '170280', name: '莴笋' },
      { id: '170180', name: '冬瓜' },
      { id: '170200', name: '苦瓜' },
      { id: '170330', name: '西葫芦' },
      { id: '170340', name: '西兰花' },
      { id: '170290', name: '绿豆芽' }
    ]
  }
}

/** @type {Map<string, { at: number, items: ReturnType<typeof mapRow>[], product: string }>} */
const cache = new Map()
const CACHE_TTL_MS = Number(process.env.AGRI_PRICE_CACHE_MS) || 10 * 60 * 1000

export function listPriceMeta () {
  return {
    categories: Object.entries(PRICE_CATEGORIES).map(([key, cat]) => ({
      key,
      label: cat.label,
      products: cat.products
    })),
    default_category: 'egg',
    default_product: '150010',
    default_province: '山东',
    unit: '元/公斤',
    source: {
      name: '商务部市场运行监测系统 · 商务预报',
      portal: 'https://cif.mofcom.gov.cn/',
      note: '全国重点监测市场批发价日度数据，非零售价'
    },
    disclaimer:
      '数据来自商务部「商务预报」批发监测，仅供参考；零售成交价以当地市场为准。'
  }
}

function stripTags (html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function numOrNull (s) {
  const n = Number(String(s || '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * @param {string[]} cells
 * @param {string} productName
 * @param {string} productId
 */
function mapRow (cells, productName, productId) {
  return {
    product_id: productId,
    product: productName,
    region: cells[0] || '',
    market: cells[1] || '',
    price: numOrNull(cells[2]),
    prev_price: numOrNull(cells[3]),
    change_pct: numOrNull(cells[4]),
    unit: '元/公斤'
  }
}

/**
 * @param {string} html
 * @param {string} productName
 * @param {string} productId
 */
function parseCifHtml (html, productName, productId) {
  /** @type {ReturnType<typeof mapRow>[]} */
  const items = []
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = re.exec(html))) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripTags(c[1])
    )
    if (cells.length < 3) continue
    // skip header
    if (/地区|市场|当日|价格/.test(cells[0]) || /地区|市场/.test(cells[1])) continue
    if (!/\d/.test(cells[2] || '')) continue
    items.push(mapRow(cells, productName, productId))
  }
  return items
}

/**
 * @param {string} productId
 * @param {string} productName
 */
async function fetchProductRows (productId, productName) {
  const cached = cache.get(productId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { items: cached.items, cached: true }
  }

  const url = `${CIF_BASE}?commdityid=${encodeURIComponent(productId)}`
  const ctrl = new AbortController()
  const timer = setTimeout(
    () => ctrl.abort(),
    Number(process.env.AGRI_PRICE_TIMEOUT_MS) || 20000
  )
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      signal: ctrl.signal
    })
    const html = await res.text()
    if (!res.ok) {
      const err = new Error(`商务预报 HTTP ${res.status}`)
      err.status = 502
      err.code = 'agri_price_upstream'
      throw err
    }
    if (/服务器发生了异常/.test(html)) {
      const err = new Error(`商务预报暂无该品种（id=${productId}）`)
      err.status = 404
      err.code = 'agri_price_not_found'
      throw err
    }
    const items = parseCifHtml(html, productName, productId)
    cache.set(productId, { at: Date.now(), items, product: productName })
    return { items, cached: false }
  } finally {
    clearTimeout(timer)
  }
}

function resolveProduct (categoryKey, productIdOrName) {
  const catKey = String(categoryKey || '').trim() || 'egg'
  const cat = PRICE_CATEGORIES[catKey]
  if (!cat) {
    const err = new Error(`未知品类：${catKey}（egg|meat|veg）`)
    err.status = 400
    err.code = 'agri_price_bad_category'
    throw err
  }
  const q = String(productIdOrName || '').trim()
  if (!q) return { category: catKey, ...cat.products[0] }
  const byId = cat.products.find((p) => p.id === q)
  if (byId) return { category: catKey, ...byId }
  const byName = cat.products.find((p) => p.name.includes(q) || q.includes(p.name))
  if (byName) return { category: catKey, ...byName }
  // allow cross-category id lookup
  for (const [key, c] of Object.entries(PRICE_CATEGORIES)) {
    const hit = c.products.find((p) => p.id === q)
    if (hit) return { category: key, ...hit }
  }
  const err = new Error(`未知品种：${q}`)
  err.status = 400
  err.code = 'agri_price_bad_product'
  throw err
}

function norm (s) {
  return String(s || '').trim().toLowerCase()
}

/**
 * @param {object} q
 * @param {string} [q.category] egg|meat|veg
 * @param {string} [q.product] 品种 id 或名称
 * @param {string} [q.province] 地区关键字，如 山东
 * @param {string} [q.city] 市场/城市关键字，如 临沂 / 青岛
 * @param {string} [q.keyword] 市场名关键字
 * @param {number|string} [q.limit]
 */
export async function queryAgriPrice (q = {}) {
  const product = resolveProduct(q.category, q.product)
  const province = String(q.province || '').trim()
  const city = String(q.city || '').trim()
  const keyword = String(q.keyword || '').trim()
  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)

  const { items: all, cached } = await fetchProductRows(product.id, product.name)
  let items = all
  if (province) {
    const p = norm(province).replace(/省$/, '')
    items = items.filter((row) => norm(row.region).includes(p))
  }
  if (city) {
    const c = norm(city).replace(/[市县区]$/, '')
    items = items.filter(
      (row) => norm(row.region).includes(c) || norm(row.market).includes(c)
    )
  }
  if (keyword) {
    const k = norm(keyword)
    items = items.filter(
      (row) =>
        norm(row.market).includes(k) ||
        norm(row.region).includes(k) ||
        norm(row.product).includes(k)
    )
  }

  const total = items.length
  items = items.slice(0, limit)
  const meta = listPriceMeta()

  return {
    source: 'mofcom_cif',
    category: product.category,
    product_id: product.id,
    product: product.name,
    unit: '元/公斤',
    total,
    cached,
    province: province || null,
    city: city || null,
    items,
    portal: meta.source.portal,
    disclaimer: meta.disclaimer
  }
}
