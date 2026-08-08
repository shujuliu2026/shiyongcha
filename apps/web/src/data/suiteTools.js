/**
 * 随用宝系列 · 静态矩阵（对齐 wikimap tools/beicheng/tools.json）
 * 下载一律进 hub，勿硬编码 exe 直链（D-2026-08-02 / suite-jumpboard）
 */

export const SUITE_HUB_URL = 'https://www.linyilu.com/tools/beicheng/'

export const SUITE_BRAND = '随用宝'

export const SUITE_TAGLINE = '本机综合工具 · 本地优先 · 选工具下载'

export const SUITE_INTRO =
  '随用宝系列在电脑上完成备份、同步与实用能力；数据默认留在本机。本站提供介绍与下载入口，不嵌套各工具功能。'

/** @typedef {{
 *   id: string,
 *   name: string,
 *   blurb: string,
 *   category: string,
 *   icon: string,
 *   freeLine: string,
 *   proLine: string,
 *   status: 'ready'|'soon'
 * }} SuiteTool */

/** @type {{ id: string, label: string }[]} */
export const SUITE_CATEGORIES = [
  { id: 'ide', label: 'IDE 备份' },
  { id: 'agent', label: 'Agent' },
  { id: 'knowledge', label: '知识库' },
  { id: 'devtools', label: '开发工具' },
  { id: 'media', label: '媒体' },
  { id: 'utility', label: '实用' }
]

/** @type {SuiteTool[]} */
export const SUITE_TOOLS = [
  {
    id: 'cursor',
    name: '随用宝-Cursor',
    blurb: '技能 · 对话归档 · 配置 · 记忆；聊天库为 Pro',
    category: 'ide',
    icon: '💎',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：侧栏聊天库等大体积轨',
    status: 'ready'
  },
  {
    id: 'trae',
    name: '随用宝-Trae CN',
    blurb: 'Trae CN 配置 · 规则 · MCP · 扩展',
    category: 'ide',
    icon: '🧩',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：大体积 / 密钥辅轨',
    status: 'ready'
  },
  {
    id: 'codebuddy',
    name: '随用宝-CodeBuddy CN',
    blurb: 'CodeBuddy CN 用户数据与扩展',
    category: 'ide',
    icon: '🧰',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：增强轨按产品说明',
    status: 'ready'
  },
  {
    id: 'workbuddy',
    name: '随用宝-WorkBuddy',
    blurb: 'SOUL / memory / skills 工作代理',
    category: 'agent',
    icon: '🤖',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：增强轨按产品说明',
    status: 'ready'
  },
  {
    id: 'hermes',
    name: '随用宝-Hermes',
    blurb: 'Hermes Agent 与本机配置',
    category: 'agent',
    icon: '🛰️',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：secrets 辅轨可选',
    status: 'ready'
  },
  {
    id: 'ima',
    name: '随用宝-IMA',
    blurb: '腾讯 IMA 桌面端本地数据（非同步插件）',
    category: 'knowledge',
    icon: '📚',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：增强轨按产品说明',
    status: 'ready'
  },
  {
    id: 'ima-sync',
    name: 'IMA 同步插件',
    blurb: 'Obsidian 笔记增量推送到腾讯 IMA 知识库（Obsidian 2 IMA）',
    category: 'knowledge',
    icon: '🔗',
    freeLine: '基础推送永久 Free',
    proLine: 'Pro：验证 · 去重 · 排版 · 链接解析',
    status: 'ready'
  },
  {
    id: 'wechat-devtools',
    name: '随用宝-微信开发者工具',
    blurb: '开发者工具 User Data / profile',
    category: 'devtools',
    icon: '📱',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：增强轨按产品说明',
    status: 'ready'
  },
  {
    id: 'jianying',
    name: '随用宝-剪映专业版',
    blurb: '剪映草稿与工程元数据',
    category: 'media',
    icon: '🎬',
    freeLine: '核心能力永久 Free',
    proLine: 'Pro：素材大体积轨可选',
    status: 'ready'
  },
  {
    id: 'snipdesk',
    name: '随用宝-截图工具',
    blurb: '区域/全屏/长图 · 标注贴图 · 本机优先',
    category: 'utility',
    icon: '✂️',
    freeLine: '核心截图与标注永久 Free',
    proLine: 'Pro：增强能力按产品说明',
    status: 'ready'
  }
]

/** hub 详情（介绍页）；下载 CTA 仍用 hub 根，避免 exe 直链 */
export function suiteDetailUrl (toolId) {
  const id = encodeURIComponent(String(toolId || '').trim())
  if (!id) return SUITE_HUB_URL
  return `${SUITE_HUB_URL}detail.html?id=${id}`
}

export function suiteCategoryLabel (categoryId) {
  return SUITE_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId
}
