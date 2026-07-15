/**
 * 单条免费查询日额度（按 IP）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSupportConfig } from './license-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = path.resolve(__dirname, '../../data/free-quota.json')

function todayKey () {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function readStore () {
  try {
    if (!fs.existsSync(STORE)) return { day: todayKey(), ips: {} }
    return JSON.parse(fs.readFileSync(STORE, 'utf8'))
  } catch {
    return { day: todayKey(), ips: {} }
  }
}

function writeStore (s) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true })
  fs.writeFileSync(STORE, JSON.stringify(s), 'utf8')
}

/**
 * @param {string} ip
 */
export function checkAndConsumeFreeSingle (ip) {
  const conf = getSupportConfig()
  const limit = conf.free_single_daily
  const key = String(ip || 'unknown').slice(0, 64)
  let store = readStore()
  const day = todayKey()
  if (store.day !== day) store = { day, ips: {} }
  const used = Number(store.ips[key] || 0)
  if (used >= limit) {
    const err = new Error('free_daily_limit')
    err.status = 429
    err.quota = { used, limit, day }
    throw err
  }
  store.ips[key] = used + 1
  writeStore(store)
  return { used: used + 1, limit, day, remaining: limit - used - 1 }
}
