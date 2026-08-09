/**
 * 实用查 · 访问埋点（轻量）
 * - 本地 tool API：/api/v1/analytics/events（后台 /admin）
 * - 临忆录工具统计：/analytics/events（client_channel=shiyongcha）
 *
 * 交互：installUiTracking() 全局采集 button / a / [data-track] 等点击
 */
import { apiUrl } from '../utils/api.js'

const VISITOR_KEY = 'syc_visitor_id'
const SESSION_KEY = 'syc_session'
const RECENT_KEY = 'syc_recent_tools'
const SESSION_TTL_MS = 30 * 60 * 1000

/** 本地 admin 允许的 hook → 工具统计前缀 hook */
const HUB_HOOK_MAP = {
  'page.view': 'shiyongcha.page_view',
  'tool.click': 'shiyongcha.tool_click',
  'search.query': 'shiyongcha.search_query',
  'page.share': 'shiyongcha.page_share',
  suite_card_impression: 'shiyongcha.suite_card_impression',
  suite_card_click: 'shiyongcha.suite_card_click',
  'btn.click': 'shiyongcha.btn_click',
  'link.click': 'shiyongcha.link_click',
  dial: 'shiyongcha.dial',
  copy: 'shiyongcha.copy',
  filter: 'shiyongcha.filter',
  submit: 'shiyongcha.submit',
  'nav.click': 'shiyongcha.nav_click',
  feedback: 'shiyongcha.feedback'
}

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

/** @returns {string[]} */
function hubAnalyticsUrls () {
  const envUrl = (import.meta.env.VITE_ANALYTICS_EVENTS_URL || '').trim()
  if (envUrl) return [envUrl]
  try {
    const host = location.hostname || ''
    if (host.includes('linyilu.com')) {
      return [`${location.origin}/analytics/events`]
    }
  } catch {
    /* ignore */
  }
  return ['https://www.linyilu.com/analytics/events']
}

/**
 * @param {string} url
 * @param {string} payload
 */
function postJson (url, payload) {
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
 * @param {{ feature_hook: string, path?: string, title?: string, referrer?: string, payload?: Record<string, unknown> }} evt
 */
export function trackEvent (evt) {
  const path = evt.path || window.location.pathname
  const title = evt.title || document.title
  const visitor = getVisitorId()
  const session = getSessionId()
  const device = deviceType()
  const referrer = evt.referrer || document.referrer || ''
  const occurred = new Date().toISOString()
  const payload = evt.payload && typeof evt.payload === 'object' ? evt.payload : undefined

  const localBody = JSON.stringify({
    events: [
      {
        feature_hook: evt.feature_hook,
        path,
        title,
        visitor_id: visitor,
        session_id: session,
        client_channel: 'h5',
        device_type: device,
        referrer,
        occurred_at: occurred,
        ...(payload ? { payload } : {})
      }
    ]
  })
  postJson(apiUrl('/api/v1/analytics/events'), localBody)

  const hubHook = HUB_HOOK_MAP[evt.feature_hook]
  if (!hubHook) return

  const hubPayload = {
    ...(payload || {}),
    path,
    title
  }
  if (!hubPayload.suite_id && typeof title === 'string') {
    const m = title.match(/suite_id=([^|]+)/)
    if (m) hubPayload.suite_id = m[1]
  }

  const hubBody = JSON.stringify({
    events: [
      {
        feature_hook: hubHook,
        path,
        title,
        visitor_id: visitor,
        session_id: session,
        client_channel: 'shiyongcha',
        device_type: device,
        referrer,
        occurred_at: occurred,
        payload: hubPayload
      }
    ]
  })
  for (const url of hubAnalyticsUrls()) {
    postJson(url, hubBody)
  }
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

function cleanLabel (raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * @param {Element} el
 */
function resolveClickTarget (el) {
  return el.closest?.(
    [
      '[data-track]',
      'button',
      'a[href]',
      '[role="button"]',
      'input[type="submit"]',
      'input[type="button"]',
      'summary',
      '.home__card',
      '.home__cat-tag',
      '.home__recent-chip',
      '.subnav__back',
      '.subnav__correct',
      '.subnav__share',
      '.suite-card',
      '.tool-card'
    ].join(',')
  )
}

/**
 * @param {Element} el
 * @returns {{ hook: string, payload: Record<string, string> } | null}
 */
function classifyClick (el) {
  const path = window.location.pathname || '/'
  if (path.includes('/admin')) return null

  const track = (el.getAttribute('data-track') || '').trim()
  const kind = (el.getAttribute('data-track-kind') || '').trim()
  const customLabel = cleanLabel(el.getAttribute('data-track-label') || '')
  const aria = cleanLabel(el.getAttribute('aria-label') || '')
  const text = cleanLabel(el.textContent || '')
  const label = customLabel || aria || text || el.tagName.toLowerCase()
  if (!label || label.length < 1) return null

  /** @type {Record<string, string>} */
  const payload = {
    label,
    kind: kind || track || el.tagName.toLowerCase()
  }
  const id = el.getAttribute('data-track-id') || el.id || ''
  if (id) payload.id = String(id).slice(0, 64)

  if (track === 'tool' || el.classList.contains('home__card') || el.classList.contains('home__recent-chip')) {
    const href = el.getAttribute('href') || ''
    payload.tool_path = href.slice(0, 120)
    return { hook: 'tool.click', payload }
  }

  if (track === 'filter' || el.classList.contains('home__cat-tag')) {
    return { hook: 'filter', payload }
  }

  if (track === 'nav' || el.classList.contains('subnav__back') || el.classList.contains('subnav__correct')) {
    const href = el.getAttribute('href') || ''
    if (href) payload.href = href.slice(0, 200)
    return { hook: 'nav.click', payload }
  }

  if (track === 'dial' || kind === 'dial') {
    return { hook: 'dial', payload }
  }
  if (track === 'copy' || kind === 'copy') {
    return { hook: 'copy', payload }
  }
  if (track === 'submit' || kind === 'submit') {
    return { hook: 'submit', payload }
  }

  if (el.tagName === 'A') {
    const href = el.getAttribute('href') || ''
    payload.href = href.slice(0, 200)
    if (href.startsWith('tel:')) {
      payload.phone = href.slice(4).slice(0, 32)
      return { hook: 'dial', payload }
    }
    if (href.startsWith('mailto:')) {
      payload.kind = 'mailto'
      return { hook: 'link.click', payload }
    }
    if (href.startsWith('http') && !href.includes(location.host)) {
      payload.kind = 'external'
      return { hook: 'link.click', payload }
    }
    return { hook: 'link.click', payload }
  }

  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'SUMMARY') {
    const t = `${label} ${aria}`.toLowerCase()
    if (/复制|拷贝|copy/.test(t)) return { hook: 'copy', payload }
    if (/拨打|电话|呼叫|拨号/.test(t)) return { hook: 'dial', payload }
    if (/分享|share/.test(t)) return { hook: 'page.share', payload }
    if (/查询|搜索|提交|确认|发送/.test(t)) return { hook: 'submit', payload }
    return { hook: 'btn.click', payload }
  }

  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || '').toLowerCase()
    if (type === 'submit' || type === 'button') {
      return { hook: type === 'submit' ? 'submit' : 'btn.click', payload }
    }
  }

  if (track) {
    return { hook: 'btn.click', payload }
  }
  return null
}

let lastUiSig = ''
let lastUiAt = 0

/**
 * 全局 UI 点击埋点（捕获阶段，覆盖各页按钮/链接）
 */
export function installUiTracking () {
  if (typeof document === 'undefined') return
  if (window.__sycUiTrackInstalled) return
  window.__sycUiTrackInstalled = true

  document.addEventListener(
    'click',
    (ev) => {
      try {
        const t = /** @type {Element | null} */ (ev.target instanceof Element ? ev.target : null)
        if (!t) return
        const el = resolveClickTarget(t)
        if (!el) return
        const classified = classifyClick(el)
        if (!classified) return
        const sig = `${classified.hook}|${classified.payload.label}|${classified.payload.href || classified.payload.tool_path || ''}`
        const now = Date.now()
        if (sig === lastUiSig && now - lastUiAt < 400) return
        lastUiSig = sig
        lastUiAt = now
        trackEvent({
          feature_hook: classified.hook,
          path: window.location.pathname,
          title: document.title,
          payload: classified.payload
        })
      } catch {
        /* ignore */
      }
    },
    true
  )

  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Enter') return
      const el = /** @type {HTMLInputElement | null} */ (ev.target)
      if (!el || el.tagName !== 'INPUT') return
      const type = (el.type || '').toLowerCase()
      const isSearch =
        type === 'search' ||
        /搜索|查询/.test(el.getAttribute('aria-label') || '') ||
        /搜索|查询/.test(el.placeholder || '')
      if (!isSearch) return
      const q = String(el.value || '').trim().slice(0, 80)
      if (!q) return
      trackEvent({
        feature_hook: 'search.query',
        path: window.location.pathname,
        payload: { q, label: 'search_enter' }
      })
    },
    true
  )
}
