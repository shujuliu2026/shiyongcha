#!/usr/bin/env node
/**
 * 对仍缺电话的社保卡网点：高德多页 POI，按脱敏尾号精确匹配
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { pickTelMatchingMask } from '../packages/shared/linyi-bank-geo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = path.join(ROOT, 'data/local/linyi/ss-card-outlets.json')

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const s = line.trim()
  if (!s || s.startsWith('#')) continue
  const i = s.indexOf('=')
  if (i <= 0) continue
  const k = s.slice(0, i).trim()
  let v = s.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (process.env[k] === undefined) process.env[k] = v
}

async function placeSearch (keywords, page = 1) {
  const key = String(process.env.AMAP_WEB_KEY || '').trim()
  const secret = String(process.env.AMAP_WEB_SECRET || '').trim()
  const params = {
    key,
    keywords: String(keywords || '').trim(),
    city: '临沂',
    citylimit: 'true',
    offset: '25',
    page: String(page),
    extensions: 'all'
  }
  const url = new URL('https://restapi.amap.com/v3/place/text')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  if (secret) {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    url.searchParams.set('sig', createHash('md5').update(sorted + secret, 'utf8').digest('hex'))
  }
  const body = await (await fetch(url)).json()
  if (String(body.status) !== '1') {
    throw Object.assign(new Error(body.info || 'amap_fail'), { upstream: body })
  }
  return body.pois || []
}

function telsFromPoi (poi) {
  return String(poi.tel || poi.phone || '')
    .split(/[;；,，|/]/)
    .map((s) => s.trim())
    .filter((s) => s && !/\*{2,}/.test(s))
}

function last4Of (phoneRaw) {
  const d = String(phoneRaw || '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : ''
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
const miss = data.items.filter((x) => !x.phone)
console.log('miss', miss.length)
let ok = 0

for (const it of miss) {
  const last4 = last4Of(it.phone_raw)
  // 原表就是热线，跳过
  if (!last4 || last4 === '5599' || String(it.phone_raw).replace(/\D/g, '') === '95599') {
    console.log('SKIP_HOTLINE_RAW', it.name, it.phone_raw)
    continue
  }

  const queries = [
    `${it.bank || ''} ${it.name}`.trim(),
    it.name_matched,
    it.name,
    it.bank === '中国银行' ? `中国银行 ${it.name}` : '',
    it.bank === '工商银行' ? `中国工商银行 ${it.name.replace(/^工商银行/, '')}` : '',
    it.bank === '农业银行' ? `中国农业银行 ${it.name.replace(/^农行/, '')}` : '',
    it.bank === '农商银行' ? `${it.name} 农村商业银行` : '',
    it.address ? `${it.bank || ''} ${it.address}` : '',
    // 区县关键词
    /市中/.test(it.name) ? `${it.bank || '银行'} 临沂市中` : '',
    /兰陵/.test(it.name) ? `${it.bank || '银行'} 兰陵 营业` : '',
    /郯城/.test(it.name) ? `${it.bank || '银行'} 郯城` : '',
    /沂南/.test(it.name) ? `${it.bank || '银行'} 沂南` : '',
    /莒南/.test(it.name) ? `莒南 农村商业银行` : '',
    /蒙阴/.test(it.name) ? `蒙阴 农村商业银行` : '',
    /临沭.*大兴|大兴/.test(it.name) ? `临沭 大兴 银行` : ''
  ].filter(Boolean)

  let found = null
  for (const q of [...new Set(queries)]) {
    for (let page = 1; page <= 3 && !found; page++) {
      try {
        await new Promise((r) => setTimeout(r, 280))
        const pois = await placeSearch(q, page)
        if (!pois.length) break
        for (const poi of pois) {
          const tels = telsFromPoi(poi)
          const tel = pickTelMatchingMask(tels, it.phone_raw, { requireMaskMatch: true })
          if (tel) {
            found = { tel, name: poi.name, address: poi.address, q, page }
            break
          }
        }
        console.log('SCAN', it.name, 'q=', q, 'page', page, 'pois', pois.length, found ? `HIT ${found.tel}` : 'no')
      } catch (e) {
        console.warn('ERR', it.name, q, e.message)
      }
    }
    if (found) break
  }

  if (found) {
    it.phone = found.tel
    it.phone_source = 'amap'
    it.phone_masked = false
    it.name_matched = found.name || it.name_matched
    ok++
    console.log('OK', it.name, found.tel, 'via', found.q, '->', found.name)
  } else {
    console.log('STILL', it.name, it.phone_raw, it.address)
  }
}

data.masked_phone_count = data.items.filter((x) => !x.phone).length
data.enriched_at = new Date().toISOString()
data.enrich_hint =
  '电话已用高德 POI 按原表脱敏尾号匹配补全；仍缺请人工核对或再跑 scripts/retry-ss-card-phones.mjs'
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
console.log(`phones ${data.items.filter((x) => x.phone).length}/${data.items.length} (+${ok})`)
