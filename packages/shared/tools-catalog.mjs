/**
 * 实用查 · 默认工具目录（可被 data/ops/catalog.json 覆盖展示/顺序）
 */
import { LOCAL_CATEGORIES, NATIONAL_CATEGORIES } from './tool-categories.mjs'

/** @typedef {{
 *   id: string,
 *   path: string,
 *   group: 'local'|'national',
 *   category?: string,
 *   icon: string,
 *   title: string,
 *   desc: string,
 *   keys?: string,
 *   sort: number,
 *   enabled: boolean
 * }} ToolItem */

/** @type {ToolItem[]} */
export const DEFAULT_TOOLS = [
  // —— 人社社保 ——
  { id: 'social-regions', path: '/social-regions', group: 'local', category: 'social', icon: '🏛️', title: '社保区划编码', desc: '失业/养老/工伤统筹区代码', keys: '失业 养老 工伤 社保 区划编码 统筹', sort: 8, enabled: true },
  { id: 'ss-card', path: '/ss-card', group: 'local', category: 'social', icon: '🪪', title: '社保卡制卡网点', desc: '即时制卡 · 多银行 · 可联网补全', keys: '社保卡 制卡 银行网点', sort: 9, enabled: true },
  { id: 'skill-subsidy', path: '/skill-subsidy', group: 'local', category: 'social', icon: '📈', title: '技能提升补贴经办', desc: '失业保险技能提升补贴经办机构', keys: '技能提升 补贴 失业 培训津贴', sort: 10, enabled: true },
  { id: 'training-orgs', path: '/training-orgs', group: 'local', category: 'social', icon: '🎓', title: '职业培训机构', desc: '机构目录 · 联网补全地址', keys: '职业培训 技能 补贴 学校', sort: 11, enabled: true },
  { id: 'edu-bases', path: '/edu-bases', group: 'local', category: 'social', icon: '📚', title: '继续教育基地', desc: '专业技术人员继续教育基地名单', keys: '继续教育 专技 基地', sort: 12, enabled: true },
  { id: 'guides', path: '/guides', group: 'local', category: 'social', icon: '📋', title: '办事指南速查', desc: '户口、社保、公积金等入口说明', keys: '户口 社保 公积金 办事', sort: 70, enabled: true },
  { id: 'hukou', path: '/hukou', group: 'local', category: 'social', icon: '🪪', title: '户籍电话', desc: '户籍窗口 · 自助点 · 可搜索', keys: '户籍 户口 派出所 身份证 自助 户政 电话', sort: 14, enabled: true },

  // —— 出行交通 ——
  { id: 'transit', path: '/transit', group: 'local', category: 'transit', icon: '🚉', title: '本地出行提示', desc: '机场、高铁、客运站电话与地址', keys: '机场 高铁 客运 出行', sort: 90, enabled: true },
  { id: 'bus', path: '/bus', group: 'local', category: 'transit', icon: '🚌', title: '临沂公交 GPS', desc: '开放网实时车辆 · 线路/附近', keys: '公交 班车 线路', sort: 100, enabled: true },
  { id: 'bus-ic', path: '/bus-ic', group: 'local', category: 'transit', icon: '💳', title: '公交IC卡网点', desc: '办理/充值网点 · 区县筛选', keys: '公交卡 IC卡 充值 售卡 办理网点', sort: 105, enabled: true },
  { id: 'bus-shelters', path: '/bus-shelters', group: 'local', category: 'transit', icon: '🚏', title: '公交站亭位置', desc: '站亭普查位置 · 道路检索', keys: '站亭 公交站 候车亭 站点位置', sort: 106, enabled: true },
  { id: 'passenger-stations', path: '/passenger-stations', group: 'local', category: 'transit', icon: '🚍', title: '道路客运场站', desc: '汽车站客运场站 · 可联网补全', keys: '客运站 汽车站 长途', sort: 107, enabled: true },
  { id: 'freight-stations', path: '/freight-stations', group: 'local', category: 'transit', icon: '🚛', title: '道路货运场站', desc: '全市货运站场 · 联网补全地址', keys: '货运 物流 场站 托运 货站', sort: 108, enabled: true },
  { id: 'driving-schools', path: '/driving-schools', group: 'local', category: 'transit', icon: '🚗', title: '驾驶员培训机构', desc: '一/二/三级驾校 · 车型范围', keys: '驾校 学车 驾驶员 C1 C2', sort: 109, enabled: true },

  // —— 农业行情 ——
  { id: 'agri-prod', path: '/agri-prod', group: 'local', category: 'agriculture', icon: '🌾', title: '分县区农业生产', desc: '蔬菜 · 夏粮 · 秋粮产量面积', keys: '蔬菜 粮食 夏粮 秋粮 播种面积 单产 县区', sort: 36, enabled: true },

  // —— 生活便民 ——
  { id: 'history-today', path: '/history-today', group: 'local', category: 'life', icon: '📜', title: '历史上的今天', desc: '临沂地方史 · 按公历日速览', keys: '历史 今天 沂蒙 银雀山 地方志', sort: 10, enabled: true },
  { id: 'old-photos', path: '/old-photos', group: 'local', category: 'life', icon: '📷', title: '临沂旧时光', desc: '精选老照片 · 完整图集回临忆录', keys: '老照片 旧时光 图集 临忆录 银雀山 火车站', sort: 12, enabled: true },
  { id: 'hospitals', path: '/hospitals', group: 'local', category: 'life', icon: '🏥', title: '医院速查', desc: '市县重点医院电话与地址', keys: '看病 急诊 就医', sort: 40, enabled: true },
  { id: 'hotlines', path: '/hotlines', group: 'local', category: 'life', icon: '📞', title: '便民电话', desc: '报警、急救、政务、供水供电', keys: '电话 110 120 12345', sort: 50, enabled: true },
  { id: 'districts', path: '/districts', group: 'local', category: 'life', icon: '📮', title: '区划与邮编', desc: '临沂区县代码 + 邮政编码', keys: '邮编 区县', sort: 60, enabled: true },

  // —— 气象环境 ——
  { id: 'local-weather', path: '/local-weather', group: 'local', category: 'weather', icon: '🌤️', title: '临沂天气', desc: '一周预报为主 · 台风距离捎带 · 可进路径页', keys: '预报 台风 气温 雨', sort: 20, enabled: true },
  { id: 'aqi', path: '/aqi', group: 'local', category: 'weather', icon: '🌫️', title: '空气质量', desc: '临沂 AQI · PM2.5 · 未来 24 小时', keys: '雾霾 污染 pm25 空气', sort: 30, enabled: true },

  // —— 金融银行 ——
  { id: 'local-bank', path: '/local-bank', group: 'local', category: 'finance', icon: '🏧', title: '本地银行网点', desc: '联行号 · 地图标注 · 区县筛选', keys: '银行 联行号 支行 地图', sort: 80, enabled: true },

  // —— 全国 ——
  { id: 'official-nav', path: '/official-nav', group: 'national', category: 'national', icon: '🧭', title: '官方信息查询', desc: '学信 · 征信 · 企信 · 裁判 · 备案等 20 站', keys: '学信 征信 企业 裁判 老赖 备案 四六级 商标 医师 软著 药监 专利 招投标', sort: 110, enabled: true },
  { id: 'id-region', path: '/id-region', group: 'national', category: 'national', icon: '🪪', title: '身份证归属', desc: '区划归属 · 校验位 · 出生日期', keys: '身份证 归属地 区划', sort: 120, enabled: true },
  { id: 'oil', path: '/oil', group: 'national', category: 'national', icon: '⛽', title: '油价速查', desc: '山东 92/95/0# · 箱油估算', keys: '汽油 柴油 加油 油价', sort: 130, enabled: true },
  { id: 'price', path: '/price', group: 'national', category: 'national', icon: '🥬', title: '菜蛋肉价', desc: '鸡蛋 · 猪肉牛肉 · 蔬菜批发价', keys: '鸡蛋 猪肉 牛肉 蔬菜 菜价 批发', sort: 135, enabled: true },
  { id: 'weather', path: '/weather', group: 'national', category: 'national', icon: '🌀', title: '台风天气', desc: '路径 · 雨层 · 告警档位 · 全国', keys: '台风 路径 雷达', sort: 140, enabled: true },
  { id: 'earthquake', path: '/earthquake', group: 'national', category: 'national', icon: '🏔️', title: '地震通报', desc: '台网列表 · 本地距离 · 预警试推', keys: '地震 震感 预警', sort: 150, enabled: true },
  { id: 'bank', path: '/bank', group: 'national', category: 'national', icon: '🏦', title: '银行支行编码', desc: '15 万联行号 · 支行名称查询', keys: '联行号 开户行 支付行号', sort: 160, enabled: true },
  { id: 'bank-batch', path: '/bank/batch', group: 'national', category: 'national', icon: '📦', title: '批量联行号', desc: '多行查询 · 激活码 · 按次/月/季', keys: '批量 联行号', sort: 170, enabled: true },
  { id: 'coord', path: '/coord', group: 'national', category: 'national', icon: '📐', title: '坐标转换', desc: 'WGS84 · GCJ02 · BD09 互转', keys: '经纬度 坐标 GPS 高德 百度', sort: 180, enabled: true },
  { id: 'holidays', path: '/holidays', group: 'national', category: 'national', icon: '📅', title: '节假日', desc: '2025-2026 放假 · 是否工作日', keys: '放假 调休 工作日', sort: 190, enabled: true },
  { id: 'feedback', path: '/feedback', group: 'national', category: 'national', icon: '💬', title: '意见反馈', desc: '功能建议 · 纠错 · 合作联系', keys: '反馈 建议 纠错', sort: 200, enabled: true }
]

export { LOCAL_CATEGORIES, NATIONAL_CATEGORIES }

export function defaultToolsById () {
  /** @type {Map<string, ToolItem>} */
  const map = new Map()
  for (const t of DEFAULT_TOOLS) map.set(t.id, { ...t })
  return map
}
