export function apiBase () {
  return String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
}

/**
 * @param {string} path
 */
export function apiUrl (path) {
  return `${apiBase()}${path}`
}
