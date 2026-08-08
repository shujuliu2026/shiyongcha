<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const data = ref(null)
const kind = ref('all')
const district = ref('')
const q = ref('')
const tip = ref('')
let tipTimer = 0

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/hukou-windows?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  const parts = keyword ? keyword.split(/\s+/).filter(Boolean) : []
  return (data.value?.items || []).filter((it) => {
    if (kind.value !== 'all' && it.kind !== kind.value) return false
    if (district.value && it.district !== district.value) return false
    if (!parts.length) return true
    const blob = [
      it.name,
      it.address,
      it.district,
      it.note,
      it.services,
      ...(it.phones || []),
      it.tel
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return parts.every((p) => blob.includes(p))
  })
})

const grouped = computed(() => {
  /** @type {Map<string, typeof filtered.value>} */
  const map = new Map()
  for (const it of filtered.value) {
    const key = it.district || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})

function kindLabel (id) {
  if (id === 'self') return '自助'
  if (id === 'window') return '窗口'
  return id
}

function showTip (msg) {
  tip.value = msg
  window.clearTimeout(tipTimer)
  tipTimer = window.setTimeout(() => { tip.value = '' }, 1600)
}

function dial (tel) {
  const t = String(tel || '').replace(/[^\d+]/g, '')
  if (!t) return
  window.location.href = `tel:${t}`
}

async function copyText (text) {
  const v = String(text || '')
  if (!v) return
  try {
    await navigator.clipboard.writeText(v)
    showTip('已复制')
  } catch {
    showTip('复制失败')
  }
}

/** 外链高德搜索（非整页小地图） */
function mapsHref (it) {
  const keyword = [it.name, it.address, it.district, '临沂'].filter(Boolean).join(' ')
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword || '临沂')}`
}

function syncQuery () {
  const query = { ...route.query }
  if (q.value.trim()) query.q = q.value.trim()
  else delete query.q
  if (kind.value && kind.value !== 'all') query.kind = kind.value
  else delete query.kind
  if (district.value) query.district = district.value
  else delete query.district
  router.replace({ query }).catch(() => {})
}

watch([q, kind, district], () => {
  syncQuery()
})

onMounted(() => {
  const qq = String(route.query.q || '')
  const kk = String(route.query.kind || '')
  const dd = String(route.query.district || '')
  if (qq) q.value = qq
  if (kk === 'window' || kk === 'self') kind.value = kk
  if (dd) district.value = dd
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="户籍电话" share-desc="临沂户籍窗口与自助受理点查询" />
    <div class="page__body">
      <p class="lead">
        户籍窗口咨询预约 + 身份证自助受理点 · 共 {{ data?.count || '—' }} 处 · 可搜索
      </p>

      <div class="form form--bank">
        <label class="hukou-search">
          搜索
          <input
            v-model="q"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            placeholder="派出所 / 区县 / 电话 / 地址 / 自助…"
            aria-label="搜索户籍窗口或自助点"
          >
        </label>
        <label>
          类型
          <select v-model="kind">
            <option value="all">全部类型</option>
            <option
              v-for="k in data?.kinds || []"
              :key="k.id"
              :value="k.id"
            >
              {{ k.label }}（{{ k.count }}）
            </option>
          </select>
        </label>
        <label>
          区县
          <select v-model="district">
            <option value="">全部区县</option>
            <option v-for="d in data?.districts || []" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
      </div>

      <p class="muted" style="margin:0 0 12px;font-size:13px">
        匹配 {{ filtered.length }} 处
        <template v-if="tip"> · {{ tip }}</template>
      </p>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <section v-for="g in grouped" :key="g.name" class="local-block">
        <h2 class="page__h2">{{ g.name }} · {{ g.items.length }}</h2>
        <ul class="hotline-list hukou-list">
          <li
            v-for="(it, idx) in g.items"
            :key="`${it.id}-${idx}`"
          >
            <div class="hotline-list__main">
              <strong>
                <span class="hukou-tag" :class="it.kind === 'self' ? 'hukou-tag--self' : ''">
                  {{ kindLabel(it.kind) }}
                </span>
                {{ it.name }}
              </strong>
              <span v-if="it.services" class="muted">{{ it.services }}</span>
              <span v-if="it.address" class="muted">{{ it.address }}</span>
              <span v-if="it.note" class="muted">备注：{{ it.note }}</span>
            </div>
            <div class="hukou-actions">
              <button
                v-for="p in (it.phones?.length ? it.phones : [it.tel]).filter(Boolean)"
                :key="p"
                type="button"
                class="btn btn--ghost hotline-list__tel"
                @click="dial(p)"
              >
                {{ p }}
              </button>
              <a
                class="btn btn--ghost"
                :href="mapsHref(it)"
                target="_blank"
                rel="noopener noreferrer"
              >
                导航
              </a>
              <button
                v-if="it.tel"
                type="button"
                class="btn btn--ghost"
                @click="copyText((it.phones || [it.tel]).join('、'))"
              >
                复制
              </button>
              <CorrectBtn :item="it.name" :hint="`${it.district || ''} ${it.address || ''} ${it.tel || ''}`" />
            </div>
          </li>
        </ul>
      </section>

      <p v-if="!loading && !error && !filtered.length" class="muted">没有匹配结果，试试区县名或「自助」</p>
      <p class="foot muted">{{ data?.disclaimer }}</p>
      <p v-if="data?.source_note" class="foot muted">来源：{{ data.source_note }}</p>
    </div>
  </div>
</template>
