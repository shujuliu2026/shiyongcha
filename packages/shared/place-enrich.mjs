/**
 * 开放网脱敏地址联网补全（高德优先，Nominatim 回落）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { amapConfigured, geocodeAmap, geocodeNominatim } from './linyi-bank-geo.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DATA_DIR = path.join(ROOT, 'data/local/linyi')

export const PLACE_FILES = Object.freeze({
  training: 'training-orgs.json',
  freight: 'freight-stations.json',
  'ss-card': 'ss-card-outlets.json',
  passenger: 'passenger-stations.json',
  driving: 'driving-schools.json'
})

/**
 * @param {string} kind
 */
export function placeFilePath (kind) {
  const name = PLACE_FILES[kind]
  if (!name) {
    const err = new Error('unknown_place_kind')
    err.status = 400
    throw err
  }
  return path.join(DATA_DIR, name)
}

/**
 * @param {string} kind
 */
export function loadPlaceData (kind) {
  const file = placeFilePath(kind)
  if (!fs.existsSync(file)) {
    const err = new Error('place_file_missing')
    err.status = 404
    throw err
  }
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) }
}

/**
 * @param {string} kind
 * @param {object} data
 */
export function savePlaceData (kind, data) {
  const file = placeFilePath(kind)
  data.enriched_at = new Date().toISOString()
  data.enriched_ok = (data.items || []).filter(
    (x) => x.address && x.address_source && x.address_source !== 'open_data'
  ).length
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  return data
}

/**
 * @param {Record<string, unknown>} item
 */
export function buildPlaceQuery (item) {
  return `${item.name || ''} ${item.address_hint || ''}`.trim()
}

/**
 * @param {{ kind: string, id?: string, name?: string, force?: boolean, allowNominatim?: boolean }} opts
 */
export async function enrichPlaceItem (opts) {
  const { file, data } = loadPlaceData(opts.kind)
  const id = String(opts.id || '').trim()
  const name = String(opts.name || '').trim()
  const item = (data.items || []).find((it) => {
    if (id && String(it.id) === id) return true
    if (name && String(it.name) === name) return true
    return false
  })
  if (!item) {
    const err = new Error('item_not_found')
    err.status = 404
    throw err
  }
  if (item.address && !opts.force) {
    return { reused: true, item, file, meta: { amap_configured: amapConfigured() } }
  }

  const query = buildPlaceQuery(item)
  let point
  if (amapConfigured()) {
    point = await geocodeAmap(query, '临沂')
  } else if (opts.allowNominatim !== false) {
    point = await geocodeNominatim(query, '临沂')
  } else {
    const err = new Error('amap_key_missing')
    err.status = 503
    err.code = 'amap_not_configured'
    throw err
  }

  const addr = String(point.address || point.name_matched || '').trim()
  if (!addr) {
    const err = new Error('empty_address')
    err.status = 502
    throw err
  }
  item.address = addr
  item.address_source = point.provider
  item.name_matched = point.name_matched || ''
  item.lat = point.lat
  item.lng = point.lng
  item.enriched_at = point.updated_at
  delete item.enrich_error
  savePlaceData(opts.kind, data)
  return { reused: false, item, file, meta: { amap_configured: amapConfigured() } }
}

export function placeEnrichMeta () {
  return {
    amap_configured: amapConfigured(),
    kinds: Object.keys(PLACE_FILES),
    hint: amapConfigured()
      ? '已配置高德，可批量/单条补全'
      : '未配置 AMAP_WEB_KEY：单条可回落 Nominatim（慢）；批量请先配置高德'
  }
}
