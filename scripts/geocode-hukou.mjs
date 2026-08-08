#!/usr/bin/env node
/**
 * 户籍窗口/自助点地理编码 → 写入 data/local/linyi/hukou-windows.json 的 lat/lng
 *
 *   node scripts/geocode-hukou.mjs
 *   node scripts/geocode-hukou.mjs --limit 40
 *   node scripts/geocode-hukou.mjs --force
 *   node scripts/geocode-hukou.mjs --approx-only
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  amapConfigured,
  approxDistrictPoint,
  geocodeAmap
} from '../packages/shared/linyi-bank-geo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'data/local/linyi/hukou-windows.json')

function loadRootEnv () {
  try {
    const envPath = path.join(ROOT, '.env')
    if (!fs.existsSync(envPath)) return
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const i = s.indexOf('=')
      if (i <= 0) continue
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

function sleep (ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildQuery (it) {
  return [it.name, it.address, it.district, '临沂'].filter(Boolean).join(' ')
}

loadRootEnv()

const force = process.argv.includes('--force')
const approxOnly = process.argv.includes('--approx-only')
const limIdx = process.argv.indexOf('--limit')
const limit = limIdx >= 0 ? Math.max(1, Number(process.argv[limIdx + 1]) || 0) : 0
const sleepMs = 220

if (!fs.existsSync(FILE)) {
  console.error('missing', FILE, '· run npm run import:hukou first')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const items = Array.isArray(data.items) ? data.items : []
console.log(
  `[hukou-geocode] total=${items.length} amap=${amapConfigured()} force=${force} approxOnly=${approxOnly}`
)

let done = 0
let ok = 0
let approx = 0
let skipped = 0

for (const it of items) {
  if (limit && done >= limit) break
  if (!force && it.lat != null && it.lng != null && it.geo_provider && it.geo_provider !== 'district_approx') {
    skipped += 1
    continue
  }
  if (!force && it.lat != null && it.lng != null && approxOnly) {
    skipped += 1
    continue
  }

  done += 1
  const q = buildQuery(it)
  let point = null
  try {
    if (!approxOnly && amapConfigured() && q) {
      point = await geocodeAmap(q, '临沂')
    }
  } catch (e) {
    console.warn(`  amap fail: ${it.name} · ${e?.message || e}`)
  }
  if (!point) {
    point = approxDistrictPoint(it.district || it.name || '临沂市')
    approx += 1
  } else {
    ok += 1
  }

  it.lat = point.lat
  it.lng = point.lng
  it.geo_provider = point.provider
  it.geo_address = point.address || point.name_matched || ''
  it.geocoded_at = point.updated_at || new Date().toISOString()

  if (done % 20 === 0) {
    data.geo_ok = items.filter((x) => x.lat != null && x.lng != null).length
    fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    console.log(`  … ${done} written (amap=${ok} approx=${approx} skip=${skipped})`)
  }
  if (!approxOnly && amapConfigured()) await sleep(sleepMs)
}

data.geo_ok = items.filter((x) => x.lat != null && x.lng != null).length
data.geocoded_at = new Date().toISOString()
fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
console.log(
  `[hukou-geocode] done processed=${done} amap=${ok} approx=${approx} skipped=${skipped} geo_ok=${data.geo_ok}`
)
