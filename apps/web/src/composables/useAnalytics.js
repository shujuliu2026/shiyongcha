/**
 * 实用查 · 访问埋点（轻量）
 */
import { apiUrl } from '../utils/api.js'

const VISITOR_KEY = 'syc_visitor_id'
const SESSION_KEY = 'syc_session'
const RECENT_KEY = 'syc_recent_tools'
const SESSION_TTL_MS = 30 * 60 * 1000

function uuid () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function getVisitorId () {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = uuid()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

function getSessionId () {
  try {
    const now = Date.now()
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.id && now - (parsed.at || 0) < SESSION_TTL_MS) {
        parsed.at = now
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed))
        return parsed.id
      }
    }
    const id = uuid()
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }))
    return id
  } catch {
    return uuid()
  }
}

function deviceType () {
  const ua = navigator.userAgent || ''
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile'
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  return 'desktop'
}

/**
 * @param {{ feature_hook: string, path?: string, title?: string, referrer?: string }} evt
 */
export function trackEvent (evt) {
  const body = {
    events: [
      {
        feature_hook: evt.feature_hook,
        path: evt.path || window.location.pathname,
        title: evt.title || document.title,
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        client_channel: 'h5',
        device_type: deviceType(),
        referrer: evt.referrer || document.referrer || '',
        occurred_at: new Date().toISOString()
      }
    ]
  }
  const url = apiUrl('/api/v1/analytics/events')
  const payload = JSON.stringify(body)
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon(url, blob)) return
    }
  } catch {
    /* fallthrough */
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true
  }).catch(() => {})
}

/**
 * @param {{ path: string, title?: string }} page
 */
export function trackPageView (page) {
  trackEvent({
    feature_hook: 'page.view',
    path: page.path,
    title: page.title
  })
}

/**
 * 首页「最近使用」
 * @param {{ to: string, title: string, icon?: string }} tool
 */
export function pushRecentTool (tool) {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    /** @type {{ to: string, title: string, icon?: string, at: number }[]} */
    let list = raw ? JSON.parse(raw) : []
    list = list.filter((x) => x.to !== tool.to)
    list.unshift({ ...tool, at: Date.now() })
    list = list.slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function listRecentTools () {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
