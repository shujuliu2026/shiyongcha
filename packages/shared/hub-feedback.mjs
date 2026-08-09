/**
 * 纠错/意见 → 临忆录 analytics hub（OPS 统一反馈收件箱）
 * 失败不抛；由 API 在本地落盘成功后 fire-and-forget。
 */
import https from 'https'
import http from 'http'

const DEFAULT_HUB =
  process.env.SHIYONGCHA_ANALYTICS_EVENTS_URL ||
  process.env.ANALYTICS_EVENTS_URL ||
  'https://www.linyilu.com/analytics/events'

/**
 * @param {{
 *   id?: string,
 *   type?: string,
 *   content: string,
 *   contact?: string,
 *   page?: string,
 *   item?: string,
 *   ip?: string
 * }} fb
 */
export function emitFeedbackToHub (fb) {
  const text = String(fb.content || '').trim().slice(0, 500)
  if (!text) return

  const kindRaw = String(fb.type || 'suggest')
  const feedback_kind =
    kindRaw === 'content' ? 'issue' : kindRaw === 'suggest' ? 'custom' : kindRaw

  const body = JSON.stringify({
    events: [
      {
        client_channel: 'shiyongcha',
        feature_hook: 'shiyongcha.feedback',
        visitor_id: `api_${String(fb.ip || 'anon').slice(0, 40)}`,
        occurred_at: new Date().toISOString(),
        path: String(fb.page || '/feedback').slice(0, 120) || '/feedback',
        title: '实用查反馈',
        payload: {
          feedback_text: text,
          feedback_kind,
          contact: String(fb.contact || '').trim().slice(0, 80),
          page: String(fb.page || '').trim().slice(0, 120),
          item: String(fb.item || '').trim().slice(0, 120),
          label: 'feedback_submit',
          feedback_id: String(fb.id || '').slice(0, 64)
        }
      }
    ]
  })

  void postJson(DEFAULT_HUB, body).catch(() => {})
}

/**
 * @param {string} urlStr
 * @param {string} body
 */
function postJson (urlStr, body) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(urlStr)
    } catch (e) {
      reject(e)
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'shiyongcha-api/hub-feedback'
        },
        timeout: 8000
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode || 0))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.write(body)
    req.end()
  })
}
