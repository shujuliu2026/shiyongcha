/**
 * 实用查 · 页面分享（系统分享 / 复制链接）
 */
import { trackEvent } from './useAnalytics.js'

/**
 * @param {{ title?: string, text?: string, url?: string }} [opts]
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 */
export async function sharePage (opts = {}) {
  const url = String(opts.url || (typeof window !== 'undefined' ? window.location.href : '')).trim()
  const title = String(opts.title || (typeof document !== 'undefined' ? document.title : '实用查')).trim()
  const text = String(opts.text || `${title}\n${url}`).trim()

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url })
        trackEvent({ feature_hook: 'page.share', path: new URL(url, location.origin).pathname, title })
        return 'shared'
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled'
        /* fallthrough to clipboard */
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      const payload = text.includes(url) ? `${title}\n${text}` : `${title}\n${text}\n${url}`
      await navigator.clipboard.writeText(payload)
      trackEvent({ feature_hook: 'page.share', path: new URL(url, location.origin).pathname, title })
      return 'copied'
    }

    // 最后手段：选中提示用 prompt
    window.prompt('复制链接分享', url)
    trackEvent({ feature_hook: 'page.share', path: new URL(url, location.origin).pathname, title })
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * @param {string} title
 * @param {string} [desc]
 */
export function buildShareText (title, desc) {
  const brand = '实用查'
  const line = desc ? `${title} · ${desc}` : title
  return `${brand}\n${line}`
}
