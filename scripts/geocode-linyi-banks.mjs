#!/usr/bin/env node
/**
 * 批量地理编码临沂银行网点 → data/linyi-bank-geo.json
 *
 * 推荐：配置 AMAP_WEB_KEY 后执行
 *   node scripts/geocode-linyi-banks.mjs
 *   node scripts/geocode-linyi-banks.mjs --limit 30
 *   node scripts/geocode-linyi-banks.mjs --force
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { searchCnapsFull } from '../packages/shared/info-bank-cnaps.mjs'
import {
  amapConfigured,
  geocodeBankBranch,
  loadGeoCache,
  lookupBankGeo
} from '../packages/shared/linyi-bank-geo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
  } catch { /* ignore */ }
}

function parseArgs (argv) {
  /** @type {Record<string, string>} */
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1'
      out[k] = v
    }
  }
  return out
}

loadRootEnv()
const args = parseArgs(process.argv)
const force = args.force === '1' || args.force === true
const limit = args.limit ? Number(args.limit) : 9999
const sleepMs = amapConfigured() ? 220 : 30

console.log(`[geocode] amap=${amapConfigured()} force=${force} sleep=${sleepMs}ms (无 Key 时用区县中心近似，配 AMAP_WEB_KEY 可精确定位)`)

/** 拉全量临沂命中：分页 */
const all = []
let offset = 0
const pageSize = 100
for (;;) {
  const page = searchCnapsFull({ city: '临沂', limit: pageSize, offset })
  if (!page?.items?.length) break
  all.push(...page.items)
  if (!page.has_more) break
  offset += pageSize
  if (all.length >= 2000) break
}

console.log(`[geocode] linyi branches ${all.length}`)

let ok = 0
let skip = 0
let fail = 0
let done = 0

for (const item of all) {
  if (done >= limit) break
  done++
  const cnaps = item.cnaps
  if (!force && lookupBankGeo(cnaps)) {
    skip++
    continue
  }
  try {
    const geo = await geocodeBankBranch({
      cnaps,
      name: item.name,
      city: '临沂',
      force
    })
    ok++
    console.log(`OK ${cnaps} ${geo.provider} ${geo.lat.toFixed(5)},${geo.lng.toFixed(5)} · ${item.name.slice(0, 36)}`)
  } catch (e) {
    fail++
    console.warn(`FAIL ${cnaps} ${e?.message || e} · ${item.name.slice(0, 36)}`)
  }
  await new Promise((r) => setTimeout(r, sleepMs))
}

const cache = loadGeoCache()
console.log(JSON.stringify({
  ok,
  skip,
  fail,
  cache_total: Object.keys(cache.points).length
}, null, 2))
