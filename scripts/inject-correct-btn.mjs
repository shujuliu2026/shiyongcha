#!/usr/bin/env node
/**
 * 给各查询页列表项注入 <CorrectBtn>（幂等，兼容 CRLF）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/src/views')
const IMPORT_LINE = "import CorrectBtn from '../components/CorrectBtn.vue'"

function ensureImport (src) {
  if (src.includes("from '../components/CorrectBtn.vue'")) return src
  if (/import SubNav from '\.\.\/components\/SubNav\.vue'\r?\n/.test(src)) {
    return src.replace(
      /(import SubNav from '\.\.\/components\/SubNav\.vue'\r?\n)/,
      `$1${IMPORT_LINE}\n`
    )
  }
  return src.replace(/(<script setup>\r?\n)/, `$1${IMPORT_LINE}\n`)
}

function patchFile (file, transform) {
  const fp = path.join(dir, file)
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', file)
    return
  }
  let src = fs.readFileSync(fp, 'utf8')
  const before = src
  src = ensureImport(src)
  src = transform(src)
  if (src !== before) {
    fs.writeFileSync(fp, src, 'utf8')
    console.log('patched', file)
  } else {
    console.log('unchanged', file)
  }
}

function insertBeforeCloseHit (src, btnHtml) {
  if (src.includes('<CorrectBtn')) return src
  // 在 batch-list__hit 闭合前插入（该块在 v-for 内只出现一次模板）
  const re = /(class="batch-list__hit">[\s\S]*?)(\r?\n[ \t]*<\/div>\r?\n[ \t]*<\/li>)/
  if (!re.test(src)) return src
  return src.replace(re, `$1\n            ${btnHtml}$2`)
}

function insertAfterHotlineTel (src, btnHtml) {
  if (src.includes('<CorrectBtn')) return src
  const re = /(class="btn btn--ghost hotline-list__tel"[\s\S]*?<\/button>)(\r?\n[ \t]*<\/li>)/
  if (!re.test(src)) return src
  return src.replace(re, `$1\n            ${btnHtml}$2`)
}

function insertInHukouActions (src, btnHtml) {
  if (src.includes('<CorrectBtn')) return src
  const re = /(class="hukou-actions">[\s\S]*?)(\r?\n[ \t]*<\/div>\r?\n[ \t]*<\/li>)/
  if (!re.test(src)) return src
  return src.replace(re, `$1\n              ${btnHtml}$2`)
}

function insertAfterLead (src, btnHtml) {
  if (src.includes('<CorrectBtn')) return src
  const re = /(<p class="lead">[\s\S]*?<\/p>)/
  if (!re.test(src)) return src
  return src.replace(re, `$1\n      <p>${btnHtml}</p>`)
}

const batch = [
  ['SocialRegionsView.vue', '<CorrectBtn :item="`${item.name} ${item.code}`" :hint="item.agency || \'\'" />'],
  ['SsCardView.vue', '<CorrectBtn :item="item.name" :hint="`${item.bank || \'\'} ${item.address || item.address_hint || \'\'}`" />'],
  ['TrainingOrgsView.vue', '<CorrectBtn :item="item.name" :hint="`${item.district || \'\'} ${item.address || item.phone || \'\'}`" />'],
  ['SkillSubsidyView.vue', '<CorrectBtn :item="item.name" :hint="`${item.address || \'\'} ${item.phone || \'\'}`" />'],
  ['EduBasesView.vue', '<CorrectBtn :item="item.name" :hint="item.address || \'\'" />'],
  ['DrivingSchoolsView.vue', '<CorrectBtn :item="item.name" :hint="`${item.district || \'\'} ${item.address || \'\'}`" />'],
  ['FreightStationsView.vue', '<CorrectBtn :item="item.name" :hint="item.address || item.address_hint || \'\'" />'],
  ['PassengerStationsView.vue', '<CorrectBtn :item="item.name" :hint="item.address || item.address_hint || \'\'" />'],
  ['BusIcView.vue', '<CorrectBtn :item="item.name" :hint="`${item.district || \'\'} ${item.address || \'\'}`" />'],
  ['BusShelterView.vue', '<CorrectBtn :item="item.name || item.address" :hint="`${item.road || \'\'} ${item.address || \'\'}`" />'],
  ['AgriProdView.vue', '<CorrectBtn :item="item.name || item.district || \'农业生产\'" :hint="String(item.year || \'\')" />']
]

for (const [file, btn] of batch) {
  patchFile(file, (src) => insertBeforeCloseHit(src, btn))
}

patchFile('HotlinesView.vue', (src) =>
  insertAfterHotlineTel(src, '<CorrectBtn :item="item.name" :hint="`${item.note || \'\'} ${item.tel || \'\'}`" />')
)
patchFile('HospitalsView.vue', (src) =>
  insertAfterHotlineTel(src, '<CorrectBtn :item="item.name" :hint="`${item.address || \'\'} ${item.tel || \'\'}`" />')
)
patchFile('TransitView.vue', (src) => {
  if (src.includes('<CorrectBtn')) return src
  // transit may use different structure
  let next = insertAfterHotlineTel(src, '<CorrectBtn :item="item.name" :hint="`${item.address || \'\'} ${item.tel || \'\'}`" />')
  if (next === src) next = insertBeforeCloseHit(src, '<CorrectBtn :item="item.name" :hint="`${item.address || \'\'} ${item.tel || \'\'}`" />')
  if (next === src) next = insertAfterLead(src, '<CorrectBtn item="出行提示" :compact="false" />')
  return next
})
patchFile('DistrictsView.vue', (src) => {
  if (src.includes('<CorrectBtn')) return src
  let next = insertAfterHotlineTel(src, '<CorrectBtn :item="item.name" :hint="`${item.code || \'\'} ${item.zip || \'\'}`" />')
  if (next === src) {
    next = src.replace(
      /(<\/li>\r?\n\s*<\/ul>)/,
      `            <CorrectBtn :item="item.name" :hint="\`${'${item.code || \'\'} ${item.zip || \'\'}'}\`" />\n          </li>\n        </ul>`
    )
    // too risky - use lead fallback
    if (!next.includes('<CorrectBtn')) next = insertAfterLead(src, '<CorrectBtn item="区划邮编" :compact="false" />')
  }
  return next
})
patchFile('HukouView.vue', (src) =>
  insertInHukouActions(src, '<CorrectBtn :item="it.name" :hint="`${it.district || \'\'} ${it.address || \'\'} ${it.tel || \'\'}`" />')
)

// fix GuidesView broken it.title
patchFile('GuidesView.vue', (src) => {
  let s = src
  s = s.replace(
    /<p style="margin:8px 0 0"><CorrectBtn :item="g\.title \|\| it\.title" :hint="g\.summary \|\| it\.summary \|\| ''" \/><\/p>\r?\n/,
    ''
  )
  if (!s.includes('<CorrectBtn')) {
    s = s.replace(
      /(<p class="guide-card__summary">\{\{ g\.summary \}\}<\/p>)/,
      `$1\n        <p style="margin:8px 0 0"><CorrectBtn :item="g.title" :hint="g.summary || ''" /></p>`
    )
  }
  return s
})

patchFile('HistoryTodayView.vue', (src) => {
  if ((src.match(/<CorrectBtn/g) || []).length) return src
  return src.replace(
    /(<p class="muted" style="margin:8px 0 0;font-size:12px">[\s\S]*?<\/p>)/,
    `$1\n          <p style="margin:8px 0 0"><CorrectBtn :item="it.title" :hint="it.summary || ''" /></p>`
  )
})

patchFile('OldPhotosView.vue', (src) => {
  if (src.includes('<CorrectBtn')) return src
  return src.replace(
    /(<em>在临忆录查看 →<\/em>\r?\n\s*<\/div>\r?\n\s*<\/a>)/,
    `$1\n        <div style="margin-top:8px"><CorrectBtn :item="it.title" :hint="String(it.year || it.era_label || '')" /></div>`
  )
})

const leadPages = [
  ['OilView.vue', '<CorrectBtn item="油价速查" hint="山东成品油参考价" :compact="false" />'],
  ['PriceView.vue', '<CorrectBtn item="菜蛋肉价" hint="商务预报批发价" :compact="false" />'],
  ['IdRegionView.vue', '<CorrectBtn item="身份证归属" :compact="false" />'],
  ['HolidaysView.vue', '<CorrectBtn item="节假日" :compact="false" />'],
  ['EarthquakeView.vue', '<CorrectBtn item="地震通报" :compact="false" />'],
  ['AqiView.vue', '<CorrectBtn item="空气质量" :compact="false" />'],
  ['LocalWeatherView.vue', '<CorrectBtn item="临沂天气" :compact="false" />'],
  ['PrecipView.vue', '<CorrectBtn item="降水量" :compact="false" />'],
  ['CoordView.vue', '<CorrectBtn item="坐标转换" :compact="false" />'],
  ['OfficialNavView.vue', '<CorrectBtn item="官方信息查询" :compact="false" />'],
  ['BankBatchView.vue', '<CorrectBtn item="批量联行号" :compact="false" />'],
  ['BusView.vue', '<CorrectBtn item="临沂公交GPS" :compact="false" />']
]

for (const [file, btn] of leadPages) {
  patchFile(file, (src) => insertAfterLead(src, btn))
}

patchFile('BankView.vue', (src) => {
  // ensure import if CorrectBtn already in template from prior run
  if (src.includes('<CorrectBtn') && src.includes("from '../components/CorrectBtn.vue'")) return src
  if (src.includes('<CorrectBtn')) return src
  return insertAfterLead(
    src,
    '<CorrectBtn :item="localMode ? \'临沂银行网点\' : \'银行支行编码\'" :compact="false" />'
  )
})

console.log('done')
