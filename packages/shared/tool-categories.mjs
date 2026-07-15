/**
 * 实用查 · 工具分类（首页分区展示）
 *
 * local 业务归类（与开放网数据集对应）：
 * - social 人社社保：区划编码、培训机构、办事入口
 * - transit 出行交通：公交 / 站亭 / IC卡 / 客运 / 货运场站
 * - life 生活便民：医院、电话、区划邮编、地方史
 * - agriculture 农业行情：分县区蔬菜/粮食生产
 * - weather 气象环境：天气、空气
 * - finance 金融银行：本地银行网点
 */

/** @typedef {{ id: string, label: string, sort: number, hint?: string }} CategoryDef */

/** @type {CategoryDef[]} */
export const LOCAL_CATEGORIES = [
  { id: 'social', label: '人社社保', sort: 10, hint: '养老/失业区划 · 职业培训' },
  { id: 'transit', label: '出行交通', sort: 20, hint: '公交 · 站亭 · IC卡 · 货运场站' },
  { id: 'life', label: '生活便民', sort: 30, hint: '医院 · 电话 · 邮编 · 地方史' },
  { id: 'agriculture', label: '农业行情', sort: 35, hint: '蔬菜 · 夏粮 · 秋粮' },
  { id: 'weather', label: '气象环境', sort: 40, hint: '天气 · 空气质量' },
  { id: 'finance', label: '金融银行', sort: 50, hint: '本地网点 · 联行号' }
]

/** @type {CategoryDef[]} */
export const NATIONAL_CATEGORIES = [
  { id: 'national', label: '全国工具', sort: 10, hint: '联行号 · 油价 · 台风 · 官方导航' }
]

/** 首页一级分类标签（横向）顺序 */
export const HOME_CATEGORY_TABS = [
  { id: 'all', label: '全部' },
  ...LOCAL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
  ...NATIONAL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, hint: c.hint }))
]

/**
 * @param {string} [id]
 * @returns {CategoryDef|null}
 */
export function localCategoryById (id) {
  return LOCAL_CATEGORIES.find((c) => c.id === id) || null
}

/**
 * @param {Array<{ category?: string, sort: number, title: string }>} tools
 * @returns {Array<{ category: CategoryDef, tools: typeof tools }>}
 */
export function groupLocalByCategory (tools) {
  /** @type {Map<string, typeof tools>} */
  const map = new Map()
  for (const t of tools) {
    const id = t.category || 'life'
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(t)
  }
  return LOCAL_CATEGORIES
    .map((c) => ({ category: c, tools: (map.get(c.id) || []).slice().sort((a, b) => a.sort - b.sort) }))
    .filter((g) => g.tools.length)
}
