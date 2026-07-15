/**
 * 激活码文件库 · data/licenses.json
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { LICENSE_PLANS } from './license-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_PATH = path.resolve(__dirname, '../../data/licenses.json')

/**
 * @typedef {{
 *   code: string,
 *   plan: 'once'|'month'|'quarter',
 *   type: 'count'|'time',
 *   quota?: number,
 *   used?: number,
 *   days?: number,
 *   activated_at?: string|null,
 *   expires_at?: string|null,
 *   token?: string|null,
 *   note?: string,
 *   created_at: string,
 *   revoked?: boolean
 * }} LicenseRecord
 */

function ensureStore () {
  const dir = path.dirname(STORE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ version: 1, licenses: [] }, null, 2), 'utf8')
  }
}

/**
 * @returns {{ version: number, licenses: LicenseRecord[] }}
 */
export function readLicenseStore () {
  ensureStore()
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
  } catch {
    return { version: 1, licenses: [] }
  }
}

/**
 * @param {{ version: number, licenses: LicenseRecord[] }} store
 */
export function writeLicenseStore (store) {
  ensureStore()
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

export function generateCode (prefix = 'SY') {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase()
  return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export function generateToken () {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * @param {{ plan: string, quota?: number, note?: string }} opts
 */
export function issueLicense (opts) {
  const planId = String(opts.plan || 'once')
  const plan = LICENSE_PLANS[planId]
  if (!plan) throw new Error('unknown_plan')

  /** @type {LicenseRecord} */
  const rec = {
    code: generateCode(),
    plan: /** @type {'once'|'month'|'quarter'} */ (planId),
    type: plan.type,
    note: opts.note || '',
    created_at: new Date().toISOString(),
    activated_at: null,
    expires_at: null,
    token: null,
    revoked: false,
    used: 0
  }
  if (plan.type === 'count') {
    rec.quota = Math.max(1, Number(opts.quota) || plan.default_quota)
  } else {
    rec.days = plan.days
  }

  const store = readLicenseStore()
  store.licenses.push(rec)
  writeLicenseStore(store)
  return rec
}

/**
 * @param {string} code
 */
export function activateLicense (code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) {
    const err = new Error('empty_code')
    err.status = 400
    throw err
  }
  const store = readLicenseStore()
  const rec = store.licenses.find((l) => l.code.toUpperCase() === c)
  if (!rec || rec.revoked) {
    const err = new Error('invalid_code')
    err.status = 404
    throw err
  }
  if (rec.token && rec.activated_at) {
    // 允许同码重新取回 token（方便换设备），时间套餐不重置到期
    return publicLicense(rec)
  }

  rec.activated_at = new Date().toISOString()
  rec.token = generateToken()
  if (rec.type === 'time') {
    const days = rec.days || LICENSE_PLANS[rec.plan]?.days || 31
    const exp = new Date(Date.now() + days * 86400000)
    rec.expires_at = exp.toISOString()
  }
  writeLicenseStore(store)
  return publicLicense(rec)
}

/**
 * @param {LicenseRecord} rec
 */
export function publicLicense (rec) {
  const remaining =
    rec.type === 'count' ? Math.max(0, (rec.quota || 0) - (rec.used || 0)) : null
  let status = 'active'
  if (rec.revoked) status = 'revoked'
  else if (rec.type === 'count' && remaining === 0) status = 'exhausted'
  else if (rec.type === 'time' && rec.expires_at && Date.now() > Date.parse(rec.expires_at)) {
    status = 'expired'
  } else if (!rec.activated_at) status = 'issued'

  return {
    code: rec.code,
    plan: rec.plan,
    plan_label: LICENSE_PLANS[rec.plan]?.label || rec.plan,
    type: rec.type,
    quota: rec.quota ?? null,
    used: rec.used || 0,
    remaining,
    activated_at: rec.activated_at,
    expires_at: rec.expires_at,
    token: rec.token,
    status
  }
}

/**
 * @param {string} token
 * @returns {LicenseRecord}
 */
export function requireLicenseByToken (token) {
  const t = String(token || '').trim()
  if (!t) {
    const err = new Error('license_required')
    err.status = 401
    throw err
  }
  const store = readLicenseStore()
  const rec = store.licenses.find((l) => l.token === t)
  if (!rec || rec.revoked) {
    const err = new Error('invalid_token')
    err.status = 401
    throw err
  }
  const pub = publicLicense(rec)
  if (pub.status === 'expired' || pub.status === 'exhausted') {
    const err = new Error(pub.status)
    err.status = 402
    err.license = pub
    throw err
  }
  return rec
}

/**
 * 扣减次数（仅 count 套餐）；time 套餐不扣
 * @param {LicenseRecord} rec
 * @param {number} n
 */
export function consumeLicense (rec, n = 1) {
  const use = Math.max(0, Math.floor(n))
  if (rec.type !== 'count' || use === 0) {
    return publicLicense(rec)
  }
  const left = (rec.quota || 0) - (rec.used || 0)
  if (left < use) {
    const err = new Error('quota_exceeded')
    err.status = 402
    err.license = publicLicense(rec)
    throw err
  }
  const store = readLicenseStore()
  const row = store.licenses.find((l) => l.code === rec.code)
  if (!row) {
    const err = new Error('invalid_token')
    err.status = 401
    throw err
  }
  row.used = (row.used || 0) + use
  writeLicenseStore(store)
  Object.assign(rec, row)
  return publicLicense(row)
}
