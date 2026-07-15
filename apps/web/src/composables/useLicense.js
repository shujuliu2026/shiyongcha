/**
 * 激活码本地会话
 */
import { ref, computed } from 'vue'
import { apiUrl } from '../utils/api.js'

const STORAGE_KEY = 'shiyongcha_license_v1'

/** @type {import('vue').Ref<null | Record<string, unknown>>} */
const license = ref(null)
const support = ref(null)
const plans = ref([])

function loadLocal () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed?.token) license.value = parsed
  } catch {
    /* ignore */
  }
}

function persist () {
  try {
    if (license.value?.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license.value))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

loadLocal()

export function useLicense () {
  const token = computed(() => String(license.value?.token || ''))
  const hasLicense = computed(() => Boolean(token.value))
  const statusLabel = computed(() => {
    const s = license.value?.status
    if (s === 'active') return '已激活'
    if (s === 'exhausted') return '次数用尽'
    if (s === 'expired') return '已过期'
    if (s === 'revoked') return '已作废'
    return '未激活'
  })

  async function fetchPlans () {
    try {
      const res = await fetch(apiUrl('/api/v1/license/plans'))
      const body = await res.json()
      if (res.ok) {
        plans.value = body.plans || []
        support.value = body.support || null
      }
    } catch {
      /* ignore */
    }
  }

  async function activate (code) {
    const res = await fetch(apiUrl('/api/v1/license/activate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || '').trim() })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)
    license.value = body.license
    persist()
    return body.license
  }

  async function refreshStatus () {
    if (!token.value) return null
    const res = await fetch(apiUrl(`/api/v1/license/status?token=${encodeURIComponent(token.value)}`), {
      headers: { 'X-License-Token': token.value }
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.license) {
      license.value = body.license
      persist()
      return body.license
    }
    if (res.status === 401 || res.status === 402) {
      if (body.license) license.value = body.license
      else clear()
      persist()
    }
    return license.value
  }

  function clear () {
    license.value = null
    persist()
  }

  /**
   * @param {Record<string, unknown> | null} next
   */
  function setLicense (next) {
    license.value = next
    persist()
  }

  /**
   * @param {Record<string, string>} [headers]
   */
  function authHeaders (headers = {}) {
    if (token.value) headers['X-License-Token'] = token.value
    return headers
  }

  return {
    license,
    support,
    plans,
    token,
    hasLicense,
    statusLabel,
    fetchPlans,
    activate,
    refreshStatus,
    clear,
    setLicense,
    authHeaders
  }
}
