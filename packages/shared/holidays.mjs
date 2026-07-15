/**
 * 国务院放假安排 · 2025-2026 静态 JSON + isWorkday
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.resolve(__dirname, '../../data/national/holidays.json')

/** @type {Record<string, unknown> | null} */
let cache = null

function loadData () {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
  } catch {
    cache = { years: {} }
  }
  return cache
}

/**
 * @param {number | string} year
 */
export function getHolidayYear (year) {
  const y = String(year)
  const data = loadData()
  const entry = data.years?.[y]
  if (!entry) {
    return {
      year: y,
      holidays: [],
      workdays: [],
      adjusted_workdays: [],
      disclaimer: '暂无该年度放假安排数据'
    }
  }
  return { year: y, ...entry }
}

/**
 * @param {string} date YYYY-MM-DD
 */
export function isWorkday (date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!m) return null

  const y = m[1]
  const entry = loadData().years?.[y]
  if (!entry) return null

  const iso = `${y}-${m[2]}-${m[3]}`
  const dow = new Date(`${iso}T12:00:00+08:00`).getDay()
  const isWeekend = dow === 0 || dow === 6

  /** @type {string[]} */
  const holidayDates = []
  for (const h of entry.holidays || []) {
    for (const d of h.dates || []) holidayDates.push(d)
  }

  if (holidayDates.includes(iso)) {
    return { date: iso, is_workday: false, reason: 'holiday' }
  }
  if ((entry.adjusted_workdays || []).includes(iso)) {
    return { date: iso, is_workday: true, reason: 'adjusted_workday' }
  }
  return { date: iso, is_workday: !isWeekend, reason: isWeekend ? 'weekend' : 'weekday' }
}
