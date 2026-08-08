#!/usr/bin/env node
/**
 * 职业培训机构：用高德 Place Text（extensions=all）补全脱敏电话
 * 仅当 POI 名称与机构名/别名足够相近时才采纳，避免张冠李戴。
 *
 * 用法：node scripts/enrich-training-phones.mjs [--limit N] [--force] [--purge-bad]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  amapConfigured,
  geocodeAmap,
  pickTelMatchingMask
} from '../packages/shared/linyi-bank-geo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = path.join(ROOT, 'data/local/linyi/training-orgs.json')

function loadEnv () {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
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
loadEnv()

const args = process.argv.slice(2)
const limitArg =
  args.find((a) => a.startsWith('--limit=')) ||
  (args.includes('--limit') ? `--limit=${args[args.indexOf('--limit') + 1]}` : '')
const limit = Math.max(1, Number(String(limitArg).split('=')[1]) || 99999)
const force = args.includes('--force')
const purgeBad = args.includes('--purge-bad') || force

function isHotline (tel) {
  const d = String(tel || '').replace(/\D/g, '')
  return /^955\d{2}$/.test(d) || /^400\d{7}$/.test(d) || d.length < 7
}

function isMasked (s) {
  const v = String(s || '').trim()
  return !v || /\*{2,}/.test(v) || v === '***'
}

function stripParen (name) {
  return String(name || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

/** 去掉区划/办学后缀，得到可比对的品牌核 */
function brandCore (name) {
  let s = stripParen(name)
    .replace(/山东省?/g, '')
    .replace(/有限公司/g, '')
    .replace(
      /职工培训中心$|职业中等专业学校$|职业技术培训学校$|职业培训学校$|职业技术学校$|技师学院$|专科学校$|培训学校$|职业学校$|卫生学校$|电力学校$|按摩培训学校$|美容美发职业培训学校$|美容美发学校$|研究院$|学院$|大学$|学校$/g,
      ''
    )
  const withoutCity = s.replace(
    /临沂市|临沂|兰山区|罗庄区|河东区|沂南县|郯城县|沂水县|兰陵县|费县|平邑县|莒南县|蒙阴县|临沭县|高新区|经开区|临港区|蒙山旅游度假区|蒙山旅游区/g,
    ''
  )
  // 去掉市名后若太短（如「临沂大学」→「大学」），保留含市名形态
  if (withoutCity.length >= 2) s = withoutCity
  return s.trim()
}

function commonPrefixLen (a, b) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/**
 * POI 名是否足够像该机构（防法院/别校错配）
 */
function looksRelatedPoi (poiName) {
  return /学校|学院|大学|培训|技师|专科|研究院|美容|美发|按摩|茶艺|家政|消防/.test(
    String(poiName || '')
  )
}

function nameAcceptable (orgName, poiName, alias = '') {
  const poiRaw = String(poiName || '')
  const poi = stripParen(poiName)
  const org = stripParen(orgName)
  if (!poiRaw || !org) return false
  // 拒绝便利店等挂名 POI
  if (!looksRelatedPoi(poiRaw) && !poiRaw.includes(org) && !(alias && poiRaw.includes(stripParen(alias)))) {
    return false
  }
  if (poi === org || poi.includes(org) || org.includes(poi) || poiRaw.includes(org)) return true
  if (alias) {
    const al = stripParen(alias)
    if (al && (poi === al || poi.includes(al) || al.includes(poi) || poiRaw.includes(al))) return true
  }

  const cores = [orgName, alias]
    .filter(Boolean)
    .map(brandCore)
    .filter((c) => c.length >= 2)
  const poiCore = brandCore(poiRaw)
  for (const c of cores) {
    if (poiRaw.includes(c) || (poiCore && (poiCore.includes(c) || c.includes(poiCore)))) {
      const other = poiCore || poi
      const shorter = c.length <= other.length ? c : other
      const longer = c.length <= other.length ? other : c
      // 极短品牌：要求相等（避免「鲁南」「东方」串到别校）
      if (shorter.length <= 2) {
        if (shorter === longer) return true
        continue
      }
      return true
    }
    // 康乐园/红房子：品牌前缀一致且 ≥3 字
    if (poiCore && commonPrefixLen(c, poiCore) >= 3) return true
  }
  return false
}

if (!amapConfigured()) {
  console.error('未配置 AMAP_WEB_KEY，无法补电话')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))

let purged = 0
if (purgeBad) {
  for (const it of data.items || []) {
    if (it.phone_source !== 'amap') continue
    if (nameAcceptable(it.name, it.name_matched, it.alias)) continue
    console.log('PURGE', it.name, '←', it.name_matched, it.phone)
    it.phone = ''
    it.phone_source = ''
    it.phone_masked = true
    purged++
  }
}

const targets = (data.items || []).filter((it) => force || isMasked(it.phone))
console.log(
  `enrich training phones · miss=${targets.length}/${data.items.length} · purged=${purged} · limit=${limit}`
)

let ok = 0
let fail = 0
let n = 0

for (const it of targets) {
  if (n >= limit) break
  n++

  // 不优先用不相关的旧 name_matched，避免一开始就落到错校
  const queries = [
    it.name,
    `${it.name} ${it.district || ''}`.trim(),
    it.alias || '',
    it.alias ? `${it.alias} ${it.district || ''}`.trim() : '',
    it.address ? `${it.name} ${it.address}` : '',
    it.address_hint ? `${it.name} ${it.address_hint}` : '',
    nameAcceptable(it.name, it.name_matched, it.alias) ? it.name_matched : ''
  ].filter(Boolean)

  let found = ''
  for (const q of [...new Set(queries)]) {
    try {
      await new Promise((r) => setTimeout(r, 420))
      const p = await geocodeAmap(q, '临沂', { extensions: 'all' })
      const matched = p.name_matched || ''
      const tel = pickTelMatchingMask(p.tels?.length ? p.tels : p.tel, it.phone_raw, {
        requireMaskMatch: false
      })
      const okName = nameAcceptable(it.name, matched, it.alias)
      console.log(
        'TRY',
        it.name,
        '|',
        q,
        '->',
        matched,
        '|',
        okName ? 'NAME_OK' : 'NAME_SKIP',
        '|',
        tel || '(none)',
        (p.tels || []).join(';')
      )
      if (!okName) continue
      if (tel && !isHotline(tel)) {
        found = tel
        it.phone = tel
        it.phone_source = 'amap'
        it.phone_masked = false
        it.name_matched = matched
        if (it.lat == null && p.lat != null) {
          it.lat = p.lat
          it.lng = p.lng
        }
        ok++
        break
      }
    } catch (e) {
      console.log('FAIL', it.name, q, e?.message || e)
    }
  }
  if (!found) {
    fail++
    console.log('STILL_EMPTY', it.name, it.address || it.address_hint || '')
  }
}

data.masked_phone_count = data.items.filter((x) => !x.phone || isMasked(x.phone)).length
data.enriched_at = new Date().toISOString()
data.enrich_hint = '电话已尽量用高德 POI 补全（名称需匹配）；仍缺的请以机构公示为准'
data.disclaimer =
  '机构名录以开放网《职业培训机构目录》为准；电话/地址经联网或公开渠道补充，可能滞后，报名/办班请以机构与人社部门公示为准。'
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
console.log(
  `done phones ${data.items.filter((x) => x.phone && !isMasked(x.phone)).length}/${data.items.length} (+${ok} this run, empty ${fail}, purged ${purged}) → ${JSON_PATH}`
)
