/**
 * 冒烟：激活 + 批量（需 API 已起在 5180）
 */
import http from 'http'
import { issueLicense } from '../packages/shared/license-store.mjs'

function req (method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 5180,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let b = ''
        res.on('data', (c) => { b += c })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b || '{}') })
          } catch {
            resolve({ status: res.statusCode, body: { raw: b } })
          }
        })
      }
    )
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

const issued = issueLicense({ plan: 'once', quota: 5, note: 'smoke-auto' })
console.log('issued', issued.code)

const act = await req('POST', '/api/v1/license/activate', { code: issued.code })
if (act.status !== 200 || !act.body.license?.token) {
  console.error('activate FAIL', act)
  process.exit(1)
}
const token = act.body.license.token
console.log('activate OK remaining', act.body.license.remaining)

const batch = await req(
  'POST',
  '/api/v1/info/bank/cnaps/batch',
  { text: '102473000010\n中国工商银行 临沂' },
  { 'X-License-Token': token }
)
console.log('batch', batch.status, 'hit', batch.body.hit_count, 'remaining', batch.body.license?.remaining)
if (batch.status !== 200) {
  console.error(batch.body)
  process.exit(1)
}
console.log('PASS')
