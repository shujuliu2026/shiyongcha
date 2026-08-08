#!/usr/bin/env node
/**
 * 从人社局补贴性培训机构目录等公开来源回写职业培训机构电话
 * （不覆盖已有非空电话，除非 --force）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = path.join(ROOT, 'data/local/linyi/training-orgs.json')
const force = process.argv.includes('--force')

/** @type {Record<string, { phone: string, phone_source: string, note?: string, alias?: string }>} */
const PHONES = {
  临沂市朝阳信息技术职业培训学校: {
    phone: '13562928227',
    phone_source: 'lanshan_gov_2026',
    note: '兰山区2026补贴性培训目录联系电话'
  },
  临沂市沂蒙红嫂职业培训学校: {
    phone: '18553919813',
    phone_source: 'linyi_gov_2025'
  },
  临沂市今日美食职业培训学校: {
    phone: '13562933109',
    phone_source: 'lanshan_gov_2026'
  },
  临沂市立德职业培训学校: {
    phone: '18866991507',
    phone_source: 'lanshan_gov_2026'
  },
  临沂创业大学: {
    phone: '15263928211',
    phone_source: 'lanshan_gov_2026',
    alias: '临沂创大职业培训学校'
  },
  临沂市科技职业技术培训学校: {
    phone: '13256550055',
    phone_source: 'luozhuang_gov_2026'
  },
  临沂市远大职业技术学校: {
    phone: '18253915566',
    phone_source: 'linyi_gov_2025'
  },
  临沂市东方职业培训学校: {
    phone: '15069973662',
    phone_source: 'mengyin_gov_2025',
    note: '蒙阴县补贴目录「蒙阴县东方职业培训学校」联系电话'
  },
  临沂市中信职业培训学校: {
    phone: '18315743999',
    phone_source: 'lanshan_gov_2026'
  },
  临沂市沂蒙大姐职业培训学校: {
    phone: '13615390007',
    phone_source: 'linyi_gov_2025'
  },
  临沂临工职业培训学校: {
    phone: '15966420276',
    phone_source: 'linyi_gov_2025'
  },
  山东医学高等专科学校: {
    phone: '0539-8016931',
    phone_source: 'sdmc_official',
    note: '校方招生信息网临沂校区咨询电话'
  },
  临沂城投职业培训学校: {
    phone: '0539-8315580',
    phone_source: 'lanshan_gov_2026'
  },
  临沂千荟职业培训学校有限公司: {
    phone: '13792927362',
    phone_source: 'linyi_gov_2025'
  },
  临沂市宏翔职业技术学校: {
    phone: '18669960078',
    phone_source: 'linyi_gov_2025',
    note: '市目录写作「临沂宏翔职业技术学校」'
  },
  临沂商城创业大学: {
    phone: '18369511676',
    phone_source: 'linyi_gov_2025'
  },
  临沂明烁一品茶艺培训学校: {
    phone: '15564933919',
    phone_source: 'linyi_gov_2025'
  },
  临沂天元建筑职业技术学校: {
    phone: '0539-8290532',
    phone_source: 'public_listing',
    note: '与临沂市建筑技师学院同址（通达路22号）公开招生电话'
  },
  '浙江大学山东（临沂）现代农业研究院': {
    phone: '0539-8717607',
    phone_source: 'public_listing',
    note: '招聘简章公布的临沂办公电话'
  },
  临沂市雅丽职业培训学校: {
    phone: '400-660-5933',
    phone_source: 'public_listing',
    note: '机构公开招生热线'
  },
  临沂广通职业培训学校: {
    phone: '15153957001',
    phone_source: 'linyi_gov_catalog',
    note: '市直职业培训机构目录（第三批）'
  },
  临沂凯旋职业技术培训学校: {
    phone: '0539-8651120',
    phone_source: 'public_listing',
    note: '凯旋医养集团公开联系电话（与培训中心同体系）'
  },
  临沂凯旋企业职工培训中心: {
    phone: '0539-8651120',
    phone_source: 'public_listing',
    note: '凯旋医养集团公开联系电话'
  },
  临沂市中军木兰职业培训学校: {
    phone: '18805397727',
    phone_source: 'public_listing',
    note: '教育类平台公示号（尾号 7727）'
  },
  临沂市天汇职业技术学校: {
    phone: '0539-8115522',
    phone_source: 'public_listing',
    note: '机构招生网公示报名电话'
  },
  临沂市能源职业培训学校: {
    phone: '15588138326',
    phone_source: 'safety_assoc',
    note: '市安全生产培训机构名录（金源路294号）'
  },
  临沂市宝蔓职业技术培训学校: {
    phone: '400-660-3310',
    phone_source: 'public_listing',
    note: '创办机构「阿宝化妆」公开咨询热线'
  }
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
let ok = 0
let skip = 0

for (const it of data.items || []) {
  const hit = PHONES[it.name]
  if (!hit?.phone) continue
  if (it.phone && !force) {
    skip++
    continue
  }
  it.phone = hit.phone
  it.phone_source = hit.phone_source
  it.phone_masked = false
  if (hit.alias && !it.alias) it.alias = hit.alias
  if (hit.note) {
    const prev = String(it.note || '')
    if (!prev.includes(hit.note)) {
      it.note = prev ? `${prev}；${hit.note}` : hit.note
    }
  }
  ok++
  console.log('SET', it.name, '→', it.phone, `(${it.phone_source})`)
}

data.masked_phone_count = data.items.filter((x) => !x.phone).length
data.enriched_at = new Date().toISOString()
data.enrich_hint =
  '电话优先人社补贴目录/校方公开号；其余高德 POI（名称匹配）'
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
console.log(
  `done +${ok} skip_existing=${skip} phones ${data.items.filter((x) => x.phone).length}/${data.items.length}`
)
