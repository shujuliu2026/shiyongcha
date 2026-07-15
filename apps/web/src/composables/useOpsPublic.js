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
 * @param {{ type: string, content: string, contact?: string, page?: string }} payload
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
