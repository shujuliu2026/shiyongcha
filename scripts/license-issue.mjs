#!/usr/bin/env node
/**
 * 签发激活码
 *
 * node scripts/license-issue.mjs --plan once --quota 100 --note "微信客户A"
 * node scripts/license-issue.mjs --plan month
 * node scripts/license-issue.mjs --plan quarter --note "季度合作"
 */
import { issueLicense } from '../packages/shared/license-store.mjs'
import { LICENSE_PLANS } from '../packages/shared/license-config.mjs'

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

const args = parseArgs(process.argv)
const plan = args.plan || 'once'
if (!LICENSE_PLANS[plan]) {
  console.error('未知套餐，可选:', Object.keys(LICENSE_PLANS).join(', '))
  process.exit(1)
}

const rec = issueLicense({
  plan,
  quota: args.quota ? Number(args.quota) : undefined,
  note: args.note || ''
})

console.log('=== 激活码已签发 ===')
console.log(JSON.stringify({
  code: rec.code,
  plan: rec.plan,
  type: rec.type,
  quota: rec.quota ?? null,
  days: rec.days ?? null,
  note: rec.note,
  created_at: rec.created_at
}, null, 2))
console.log('\n请通过客服微信发给用户；用户在「批量联行号」页 (/bank/batch) 激活。')
