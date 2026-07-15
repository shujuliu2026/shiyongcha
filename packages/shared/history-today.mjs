/**
 * 临沂 · 历史上的今天
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { APP_CONFIG } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_LOCAL = path.resolve(__dirname, '../../data/local')

/**
 * @param {Date} [d]
 */
export function shanghaiMmDd (d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)
  const m = parts.find((p) => p.type === 'month')?.value || '01'
  const day = parts.find((p) => p.type === 'day')?.value || '01'
  return `${m}-${day}`
}

/**
 * @param {string} city
 */
function loadHistory (city) {
  const id = String(city || APP_CONFIG.defaultCity.id).toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const fp = path.join(DATA_LOCAL, id, 'history-today.json')
  if (!fs.existsSync(fp)) {
    const err = new Error('history_not_found')
    err.status = 404
    throw err
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'))
}

/**
 * @param {{ city?: string, date?: string }} [opts]
 */
export function getHistoryToday (opts = {}) {
  const city = opts.city || APP_CONFIG.defaultCity.id
  const data = loadHistory(city)
  const mmdd = /^\d{2}-\d{2}$/.test(String(opts.date || ''))
    ? String(opts.date)
    : shanghaiMmDd()

  const items = (data.items || []).filter((it) => it.mmdd === mmdd)
  const month = mmdd.slice(0, 2)
  const monthItems = (data.items || [])
    .filter((it) => String(it.mmdd || '').startsWith(`${month}-`))
    .slice(0, 12)

  return {
    city: data.city || city,
    date: mmdd,
    label: `${Number(mmdd.slice(0, 2))}月${Number(mmdd.slice(3, 5))}日`,
    items,
    month_highlights: items.length ? [] : monthItems,
    total_catalog: (data.items || []).length,
    disclaimer: data.disclaimer || '公开史料整理，仅供参考；细节请核对权威地方志。',
    source_note: data.source_note || ''
  }
}
