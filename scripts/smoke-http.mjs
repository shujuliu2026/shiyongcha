#!/usr/bin/env node
/** 实用查 · HTTP 全量冒烟（异常清单） */
const BASE = 'http://127.0.0.1:5180'
const WEB = 'http://127.0.0.1:5176'

async function hit (label, path, opts = {}) {
  const url = path.startsWith('http') ? path : BASE + path
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout || 25000)
    })
    const ms = Date.now() - t0
    const bodyText = await res.text()
    let json = null
    try {
      json = JSON.parse(bodyText)
    } catch {
      /* html */
    }
    let ok = res.ok
    let detail = ''
    if (json && json.error) {
      ok = false
      detail = String(json.error) + (json.message ? `: ${json.message}` : '')
    }
    if (opts.expect) {
      const e = opts.expect(json, res, bodyText)
      if (e) {
        ok = false
        detail = e
      }
    }
    return { label, path, status: res.status, ms, ok, detail: String(detail).slice(0, 200) }
  } catch (e) {
    return {
      label,
      path,
      status: 0,
      ms: Date.now() - t0,
      ok: false,
      detail: String(e.message || e).slice(0, 200)
    }
  }
}

function nonemptyLocal (j, res) {
  if (!res.ok) return `http ${res.status}`
  if (Array.isArray(j?.items) && j.items.length === 0) return 'empty items'
  if (Array.isArray(j?.categories) && j.categories.length === 0) return 'empty categories'
  return null
}

const localMap = {
  'social-regions': '/api/v1/local/social-regions',
  'ss-card': '/api/v1/local/ss-card',
  'skill-subsidy': '/api/v1/local/skill-subsidy',
  'training-orgs': '/api/v1/local/training-orgs',
  'edu-bases': '/api/v1/local/edu-bases',
  guides: '/api/v1/local/guides',
  hukou: '/api/v1/local/hukou-windows',
  transit: '/api/v1/local/transit',
  'bus-ic': '/api/v1/local/bus-ic',
  'bus-shelters': '/api/v1/local/bus-shelters',
  'passenger-stations': '/api/v1/local/passenger-stations',
  'freight-stations': '/api/v1/local/freight-stations',
  'driving-schools': '/api/v1/local/driving-schools',
  'agri-prod': '/api/v1/local/agri-prod',
  'history-today': '/api/v1/local/history-today',
  'old-photos': '/api/v1/local/old-photos',
  hospitals: '/api/v1/local/hospitals',
  hotlines: '/api/v1/local/hotlines',
  districts: '/api/v1/local/districts',
  'local-bank-geo': '/api/v1/local/bank/geo/status'
}

const live = [
  ['aqi', '/api/v1/weather/aqi'],
  ['typhoon-activity', '/api/v1/weather/typhoon/activity'],
  ['radar-frames', '/api/v1/weather/radar/frames'],
  ['env-air', '/api/v1/env/air'],
  ['env-precip', '/api/v1/env/precip'],
  ['oil', '/api/v1/national/oil'],
  ['holidays', '/api/v1/national/holidays'],
  ['is-workday', '/api/v1/national/is-workday?date=2026-10-01'],
  ['id-region', '/api/v1/national/id-region?q=371302'],
  ['earthquake', '/api/v1/national/earthquake/list?limit=5'],
  ['earthquake-eew', '/api/v1/national/earthquake/eew'],
  ['bank-meta', '/api/v1/info/bank/meta'],
  ['bank-cnaps', '/api/v1/info/bank/cnaps?city=%E4%B8%B4%E6%B2%82&bank=%E5%B7%A5%E5%95%86&limit=3'],
  ['price-meta', '/api/v1/info/price/meta'],
  ['price-egg', '/api/v1/info/price/query?category=egg'],
  ['bus-status', '/api/v1/local/bus/status'],
  ['bus-gps', '/api/v1/local/bus/gps?limit=5'],
  ['license-plans', '/api/v1/license/plans']
]

const checks = []
checks.push(await hit('health', '/api/v1/health'))
checks.push(
  await hit('catalog', '/api/v1/catalog', {
    expect: (j) => (!j.local?.length ? 'empty catalog' : null)
  })
)
checks.push(await hit('notices', '/api/v1/notices'))
checks.push(await hit('config', '/api/v1/config'))

for (const [id, p] of Object.entries(localMap)) {
  const path = p.includes('?') ? p : `${p}?city=linyi`
  checks.push(await hit(id, path, { expect: nonemptyLocal }))
}

for (const [label, p] of live) {
  checks.push(await hit(label, p))
}

const catalog = await (await fetch(`${BASE}/api/v1/catalog`)).json()
const tools = [...(catalog.local || []), ...(catalog.national || [])]
for (const t of tools) {
  const path = t.path || t.to
  if (!path || String(path).startsWith('http')) continue
  checks.push(await hit(`page:${t.id}`, WEB + path))
}
checks.push(await hit('page:suite', `${WEB}/suite`))
checks.push(await hit('page:home', `${WEB}/`))

const bad = checks.filter((c) => !c.ok)
const warn = checks.filter((c) => c.ok && c.ms > 8000)
console.log(
  JSON.stringify(
    {
      total: checks.length,
      ok: checks.length - bad.length,
      fail: bad.length,
      slow: warn.map((c) => ({ label: c.label, ms: c.ms })),
      failures: bad
    },
    null,
    2
  )
)
process.exit(bad.length ? 1 : 0)
