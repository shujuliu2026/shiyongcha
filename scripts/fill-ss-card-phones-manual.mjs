#!/usr/bin/env node
/**
 * 手工核对准源电话写回 ss-card-outlets.json（尾号优先；官方名址一致可放宽）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = path.join(ROOT, 'data/local/linyi/ss-card-outlets.json')
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))

/** @type {Array<{ name: string, phone: string, source: string, matchLast4?: boolean }>} */
const FILLS = [
  // 尾号一致
  { name: '农行兰陵县支行营业室', phone: '0539-5211408', source: 'public_listing', matchLast4: true },
  { name: '郯城支行营业部', phone: '0539-6226671', source: 'boc_official', matchLast4: true },
  // 中行官网名址一致（原表脱敏尾号可能过期）
  { name: '郯城县支行营业部', phone: '0539-6226671', source: 'boc_official', matchLast4: false },
  { name: '沂南支行营业部', phone: '0539-3222959', source: 'boc_official', matchLast4: false },
  { name: '临沂市市中支行', phone: '0539-8176202', source: 'boc_official', matchLast4: false },
  { name: '兰陵县支行营业部', phone: '0539-5215326', source: 'boc_official', matchLast4: false },
  // 山东农信公开网点名录（名址一致；原表脱敏尾号可能过期）
  { name: '蒙阴农商银行', phone: '0539-7141165', source: 'sdnxs_official', matchLast4: false },
  { name: '临沭县大兴支行', phone: '0539-6911030', source: 'sdnxs_official', matchLast4: false }
]

function last4 (s) {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : ''
}

let ok = 0
for (const fill of FILLS) {
  const it = data.items.find((x) => x.name === fill.name && !x.phone)
  if (!it) {
    console.log('SKIP', fill.name, '(已有或不存在)')
    continue
  }
  if (fill.matchLast4 !== false) {
    const a = last4(it.phone_raw)
    const b = last4(fill.phone)
    if (a && b && a !== b) {
      console.warn('LAST4_MISMATCH', fill.name, it.phone_raw, fill.phone)
      continue
    }
  }
  it.phone = fill.phone
  it.phone_source = fill.source
  it.phone_masked = false
  ok++
  console.log('SET', fill.name, fill.phone, fill.source)
}

// 原表就是热线：记客服号，便于拨打
const hot = data.items.find((x) => x.name === '农行沂水县支行沂城支行' && !x.phone)
if (hot && String(hot.phone_raw).replace(/\D/g, '') === '95599') {
  hot.phone = '95599'
  hot.phone_source = 'open_data_hotline'
  hot.phone_masked = false
  ok++
  console.log('SET', hot.name, '95599', 'hotline')
}

data.masked_phone_count = data.items.filter((x) => !x.phone).length
data.enriched_at = new Date().toISOString()
data.disclaimer =
  '社保卡即时制卡网点电话/地址据开放网名录与高德/银行官网补全；办理前请电话确认网点状态。部分原表脱敏尾号与现行公开号不一致时，以官网为准。'
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
const withPhone = data.items.filter((x) => x.phone).length
console.log(`phones ${withPhone}/${data.items.length} (+${ok}) still_empty=${data.masked_phone_count}`)
for (const it of data.items.filter((x) => !x.phone)) {
  console.log('EMPTY', it.name, it.phone_raw)
}
