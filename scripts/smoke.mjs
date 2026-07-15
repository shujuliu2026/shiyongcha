#!/usr/bin/env node
/**
 * 实用查 · 冒烟测试（模块导入 + 本地查询）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { queryCnaps, listCnapsMeta } from '../packages/shared/info-bank-cnaps.mjs'
import { DEFAULT_WATCH, haversineKm } from '../packages/shared/weather-radar-core.mjs'
import { getHolidayYear, isWorkday } from '../packages/shared/holidays.mjs'
import { fetchEarthquakeList } from '../packages/shared/earthquake-core.mjs'
import { getHistoryToday } from '../packages/shared/history-today.mjs'
import {
  ingestAnalyticsEvents,
  analyticsSummary,
  todayShanghai
} from '../packages/shared/analytics-store.mjs'
import {
  listCatalog,
  saveCatalog,
  saveNotices,
  listNotices,
  submitFeedback,
  listFeedback,
  opsOverview
} from '../packages/shared/ops-store.mjs'

console.log('=== 实用查 smoke ===')

const meta = listCnapsMeta()
console.log(`CNAPS meta: source=${meta.source} full=${meta.full_count} seed=${meta.seed_count} banks=${meta.bank_count || meta.banks.length}`)

const bank = await queryCnaps({ city: '临沂', bank: '工商', limit: 3 })
console.log(`CNAPS 临沂工商: ${bank.items.length} hits`, bank.items[0]?.name || '(none)', bank.items[0]?.cnaps || '')

const byCode = await queryCnaps({ keyword: bank.items[0]?.cnaps || '102100000021', limit: 1 })
console.log(`CNAPS exact:`, byCode.items[0]?.name || '(none)')

console.log(`DEFAULT_WATCH: ${DEFAULT_WATCH.label} ${DEFAULT_WATCH.lat},${DEFAULT_WATCH.lng} alert=${DEFAULT_WATCH.alertKm}km`)
console.log(`haversine test: ${haversineKm(DEFAULT_WATCH.lat, DEFAULT_WATCH.lng, 31.2, 121.5).toFixed(1)} km to Shanghai`)

const hol = getHolidayYear(2026)
console.log(`Holidays 2026: ${hol.holidays?.length || 0} blocks`)

const wd = isWorkday('2026-10-01')
console.log(`isWorkday 2026-10-01:`, wd)

const eq = await fetchEarthquakeList({ minMag: 4, limit: 5 })
console.log(`Earthquake ≥4: ${eq.count} (attention ${eq.attention_count})`, eq.items[0]?.location, 'M' + eq.items[0]?.magnitude)

const hist = getHistoryToday({ date: '07-14' })
if (!hist.items?.length) throw new Error('history-today 07-14 empty')
console.log(`History 07-14: ${hist.items.length} items · ${hist.items[0].title}`)

const busIcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi/bus-ic-outlets.json')
const busIc = JSON.parse(fs.readFileSync(busIcPath, 'utf8'))
if (!busIc.items?.length || busIc.count !== busIc.items.length) throw new Error('bus-ic outlets invalid')
console.log(`Bus IC outlets: ${busIc.count} · ${busIc.types?.join('/')}`)

const shelterPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi/bus-shelters.json')
const shelters = JSON.parse(fs.readFileSync(shelterPath, 'utf8'))
if (!shelters.items?.length || shelters.count !== shelters.items.length) throw new Error('bus-shelters invalid')
if (!shelters.items[0]?.address) throw new Error('bus-shelters missing address col')
console.log(`Bus shelters: ${shelters.count} · roads ${shelters.roads?.length || 0}`)

const socialPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi/social-regions.json')
const social = JSON.parse(fs.readFileSync(socialPath, 'utf8'))
if (!social.items?.length) throw new Error('social-regions empty')
console.log(`Social regions: ${social.count}`)

const freightPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi/freight-stations.json')
const freight = JSON.parse(fs.readFileSync(freightPath, 'utf8'))
if (!freight.items?.length) throw new Error('freight-stations empty')
console.log(`Freight stations: ${freight.count} · masked ${freight.masked_address_count}`)

const trainPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi/training-orgs.json')
const train = JSON.parse(fs.readFileSync(trainPath, 'utf8'))
if (!train.items?.length) throw new Error('training-orgs empty')
console.log(`Training orgs: ${train.count} · masked addr ${train.masked_address_count}`)

for (const [label, rel] of [
  ['SS card', 'ss-card-outlets.json'],
  ['Passenger', 'passenger-stations.json'],
  ['Driving', 'driving-schools.json']
]) {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/local/linyi', rel)
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!j.items?.length) throw new Error(`${rel} empty`)
  console.log(`${label}: ${j.count} · masked ${j.masked_address_count ?? '?'}`)
}




const ingest = ingestAnalyticsEvents(
  [
    {
      feature_hook: 'page.view',
      path: '/history-today',
      title: '历史上的今天',
      visitor_id: 'smoke-visitor',
      session_id: 'smoke-session',
      client_channel: 'h5',
      device_type: 'desktop',
      occurred_at: new Date().toISOString()
    }
  ],
  { ip: '127.0.0.1' }
)
const sum = analyticsSummary('today')
if (!ingest.accepted || sum.pv < 1) throw new Error('analytics ingest/summary failed')
console.log(`Analytics today (${todayShanghai()}): PV=${sum.pv} UV=${sum.uv} top=${sum.top_paths[0]?.path || '-'}`)

const cat0 = listCatalog({ all: true })
if (cat0.tools.length < 10) throw new Error('catalog too small')
const hidden = cat0.tools.map((t, i) =>
  i === 0 ? { ...t, enabled: false, sort: 1 } : { ...t, sort: (i + 1) * 10 }
)
const cat1 = saveCatalog({ tools: hidden })
if (cat1.tools[0].enabled !== false) throw new Error('catalog hide failed')
saveCatalog({ tools: cat0.tools })
console.log(`Catalog: ${cat0.tools.length} tools · save/restore OK`)

const note = saveNotices({
  notice: {
    title: 'smoke 公告',
    body: '冒烟测试公告，可忽略',
    level: 'info',
    enabled: true
  }
})
if (!note.notices.some((n) => n.title === 'smoke 公告')) throw new Error('notice publish failed')
const pub = listNotices({ all: false })
console.log(`Notices: admin=${note.total} public=${pub.notices.length}`)

const fb = submitFeedback(
  { type: 'suggest', content: 'smoke 反馈内容测试', contact: '' },
  { ip: '127.0.0.1' }
)
const fbList = listFeedback({ limit: 10 })
if (!fb.ok || !fbList.items.some((x) => x.id === fb.id)) throw new Error('feedback failed')
console.log(`Feedback: id=${fb.id} total=${fbList.counts.total}`)

const ov = opsOverview('today')
if (ov.traffic.pv < 1) throw new Error('ops overview missing traffic')
console.log(`Ops overview: PV=${ov.traffic.pv} tools=${ov.catalog.enabled}/${ov.catalog.total} fbNew=${ov.feedback.new}`)

console.log('=== smoke OK ===')
