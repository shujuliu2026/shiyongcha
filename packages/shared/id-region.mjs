/**
 * 身份证号 · 校验位 + 行政区划归属地
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, '../../data/national/id-regions.json')

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK_MAP = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

/** @type {{ regions: Record<string,string>, provinces: Record<string,string>, cities: Record<string,string>, updated?: string } | null} */
let cache = null

function load () {
  if (cache) return cache
  cache = JSON.parse(fs.readFileSync(DATA, 'utf8'))
  return cache
}

/**
 * @param {string} id18
 */
export function computeCheckDigit (id17) {
  const s = String(id17 || '')
  if (!/^\d{17}$/.test(s)) return null
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(s[i]) * WEIGHTS[i]
  return CHECK_MAP[sum % 11]
}

/**
 * @param {string} id
 */
export function validateIdChecksum (id) {
  const s = String(id || '').trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(s)) {
    return { ok: false, reason: 'format', message: '请输入 18 位身份证号' }
  }
  const expect = computeCheckDigit(s.slice(0, 17))
  if (expect == null) {
    return { ok: false, reason: 'format', message: '前 17 位须为数字' }
  }
  const actual = s[17]
  if (actual !== expect) {
    return {
      ok: false,
      reason: 'checksum',
      message: `校验位不正确（应为 ${expect}）`,
      expect,
      actual
    }
  }
  return { ok: true, expect, actual }
}

/**
 * @param {string} code6
 */
export function lookupRegionCode (code6) {
  const db = load()
  const code = String(code6 || '').replace(/\D/g, '').slice(0, 6)
  if (code.length < 2) {
    return { found: false, message: '区划代码不足' }
  }
  const area = db.regions[code] || null
  const cityCode = code.slice(0, 4)
  const provCode = code.slice(0, 2)
  const city =
    db.regions[`${cityCode}00`] ||
    db.cities[cityCode] ||
    null
  const province =
    db.regions[`${provCode}0000`] ||
    db.provinces[provCode] ||
    null

  const parts = [province, city, area].filter(Boolean)
  // 去重（直辖市城市名常与省级重复）
  const uniq = []
  for (const p of parts) {
    if (!uniq.length || uniq[uniq.length - 1] !== p) uniq.push(p)
  }

  return {
    found: Boolean(province || city || area),
    code,
    province,
    city,
    area,
    label: uniq.length ? uniq.join(' · ') : '未收录该区划代码',
    updated: db.updated || null,
    source: db.source || null
  }
}

/**
 * @param {string} idOrCode
 */
export function lookupIdRegion (idOrCode) {
  const raw = String(idOrCode || '').trim().toUpperCase()
  const digits = raw.replace(/[^\dX]/g, '')

  if (/^\d{6}$/.test(digits)) {
    return {
      input: digits,
      mode: 'code',
      checksum: null,
      region: lookupRegionCode(digits)
    }
  }

  if (!/^\d{17}[\dX]?$/.test(digits) && !/^\d{15}$/.test(digits)) {
    return {
      input: raw,
      mode: 'unknown',
      error: '请输入 15/18 位身份证号，或 6 位行政区划代码',
      checksum: null,
      region: null
    }
  }

  let id18 = digits
  let checksum = null
  if (digits.length === 15) {
    // 15 位旧证：年份补 19，无校验位
    id18 = `${digits.slice(0, 6)}19${digits.slice(6)}`
    checksum = { ok: true, reason: 'legacy15', message: '15 位旧证，无校验位（已按 19xx 补全）' }
  } else if (digits.length === 17) {
    const d = computeCheckDigit(digits)
    id18 = digits + d
    checksum = { ok: true, reason: 'computed', message: `已补全校验位 ${d}`, expect: d }
  } else {
    checksum = validateIdChecksum(digits)
    id18 = digits
  }

  const region = lookupRegionCode(id18.slice(0, 6))
  const birth =
    id18.length >= 14
      ? `${id18.slice(6, 10)}-${id18.slice(10, 12)}-${id18.slice(12, 14)}`
      : null
  const seq = id18.length >= 17 ? id18.slice(14, 17) : null
  const gender =
    seq != null && /^\d{3}$/.test(seq)
      ? Number(seq) % 2 === 1
        ? '男'
        : '女'
      : null

  return {
    input: raw,
    mode: 'id',
    id18,
    birth,
    gender,
    checksum,
    region,
    disclaimer: '仅解析号码编码规则与公开区划，不核验真伪身份、不联网查库'
  }
}
