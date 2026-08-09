/**
 * 前台运营数据：工具目录 / 公告
 */
import { apiUrl } from '../utils/api.js'

/**
 * @returns {Promise<{ tools: any[], local: any[], national: any[], categories?: any }>}
 */
export async function fetchCatalog () {
  const res = await fetch(apiUrl('/api/v1/catalog'))
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
  return {
    tools: body.tools || [],
    local: body.local || [],
    national: body.national || [],
    categories: body.categories || null,
    updated_at: body.updated_at || null
  }
}

/**
 * @returns {Promise<any[]>}
 */
export async function fetchNotices () {
  const res = await fetch(apiUrl('/api/v1/notices'))
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return []
  return Array.isArray(body.notices) ? body.notices : []
}

/**
 * 提交纠错/意见：本地运营台落盘；OPS 收件箱由 API 服务端双写 analytics
 * @param {{ type: string, content: string, contact?: string, page?: string, item?: string }} payload
 */
export async function postFeedback (payload) {
  const res = await fetch(apiUrl('/api/v1/feedback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
  return body
}
