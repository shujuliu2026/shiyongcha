/**
 * 对脱敏地址做联网补全（高德 Place Text，可选 Nominatim 回落）
 *
 * 用法：
 *   npm run enrich:places -- training [--limit 20] [--force]
 *   npm run enrich:places -- freight|ss-card|passenger|driving
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  PLACE_FILES,
  buildPlaceQuery,
  loadPlaceData,
  savePlaceData
} from '../packages/shared/place-enrich.mjs'
import { amapConfigured, geocodeAmap, geocodeNominatim } from '../packages/shared/linyi-bank-geo.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

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
loadRootEnv()

const args = process.argv.slice(2)
const kind = args.find((a) => !a.startsWith('--')) || ''
const limitArg =
  args.find((a) => a.startsWith('--limit=')) ||
  (args.includes('--limit') ? `--limit=${args[args.indexOf('--limit') + 1]}` : '')
const limit = Math.max(1, Number(String(limitArg).split('=')[1]) || 99999)
const force = args.includes('--force')
const useNominatim = args.includes('--nominatim') || !amapConfigured()

if (!PLACE_FILES[kind]) {
  console.error(
    `用法: node scripts/enrich-masked-places.mjs <${Object.keys(PLACE_FILES).join('|')}> [--limit N] [--force] [--nominatim]`
  )
  process.exit(1)
}

const { file, data } = loadPlaceData(kind)
let ok = 0
let skip = 0
let fail = 0
let n = 0

console.log(
  `enrich ${kind} · amap=${amapConfigured()} · nominatim=${useNominatim} · limit=${limit} · force=${force}`
)

for (const item of data.items) {
  if (n >= limit) break
  if (item.address && !force) {
    skip++
    continue
  }
  if (!item.address_masked && item.address) {
    skip++
    continue
  }

  const query = buildPlaceQuery(item)
  n++
  try {
    let point = null
    if (amapConfigured()) {
      // 个人 Key 常限约 3～5 QPS，控速避免 CUQPS_HAS_EXCEEDED_THE_LIMIT
      await new Promise((r) => setTimeout(r, 320))
      point = await geocodeAmap(query, '临沂')
    } else if (useNominatim) {
      await new Promise((r) => setTimeout(r, 1100))
      point = await geocodeNominatim(query, '临沂')
    } else {
      throw Object.assign(new Error('amap_key_missing'), { status: 503 })
    }

    const addr = String(point.address || point.name_matched || '').trim()
    if (!addr) throw new Error('empty_address')
    item.address = addr
    item.address_source = point.provider
    item.name_matched = point.name_matched || ''
    item.lat = point.lat
    item.lng = point.lng
    item.enriched_at = point.updated_at
    delete item.enrich_error
    ok++
    console.log(`OK ${ok} ${item.name} → ${addr.slice(0, 60)}`)
  } catch (e) {
    fail++
    item.enrich_error = e?.message || String(e)
    console.warn(`FAIL ${item.name}: ${item.enrich_error}`)
  }
}

savePlaceData(kind, data)
console.log(`done ok=${ok} skip=${skip} fail=${fail} → ${file}`)
