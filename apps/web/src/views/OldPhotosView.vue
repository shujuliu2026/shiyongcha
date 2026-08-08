<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const era = ref('all')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/old-photos?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const items = computed(() => {
  const list = Array.isArray(data.value?.items) ? data.value.items : []
  if (era.value === 'all') return list
  return list.filter((it) => it.era === era.value)
})

const eraTabs = computed(() => {
  const list = Array.isArray(data.value?.items) ? data.value.items : []
  /** @type {Map<string, { id: string, label: string, count: number }>} */
  const map = new Map()
  for (const it of list) {
    const id = it.era || 'other'
    const cur = map.get(id) || { id, label: it.era_label || id, count: 0 }
    cur.count += 1
    map.set(id, cur)
  }
  return [
    { id: 'all', label: '全部', count: list.length },
    ...[...map.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  ]
})

const hub = computed(() => data.value?.hub || {})

function yearText (it) {
  if (it?.year) return String(it.year)
  return it?.era_label || ''
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav
      title="临沂旧时光"
      share-desc="精选老照片 · 完整图集回临忆录"
    />
    <div class="page__body oldphotos">
      <p class="lead">
        {{ data?.title || '临沂旧时光' }} · 站内精选预览
      </p>
      <p class="muted oldphotos__note">
        {{ data?.source_note || '精选自临忆录已发布图集。' }}
      </p>

      <div class="oldphotos__hub">
        <a
          class="oldphotos__hub-btn oldphotos__hub-btn--primary"
          :href="hub.atlas_url || 'https://www.linyilu.com/atlas'"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开完整图集
        </a>
        <a
          class="oldphotos__hub-btn"
          :href="hub.map_url || 'https://www.linyilu.com/'"
          target="_blank"
          rel="noopener noreferrer"
        >
          地图 · 旧时光
        </a>
        <a
          v-if="hub.submit_url"
          class="oldphotos__hub-btn"
          :href="hub.submit_url"
          target="_blank"
          rel="noopener noreferrer"
        >
          提供老照片
        </a>
      </div>

      <nav v-if="eraTabs.length > 1" class="oldphotos__eras" aria-label="年代">
        <button
          v-for="tab in eraTabs"
          :key="tab.id"
          type="button"
          class="oldphotos__era"
          :class="{ 'is-active': era === tab.id }"
          @click="era = tab.id"
        >
          {{ tab.label }}
          <em>{{ tab.count }}</em>
        </button>
      </nav>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <div v-if="!loading && !error" class="oldphotos__grid">
        <a
          v-for="it in items"
          :key="it.id"
          class="oldphotos__card"
          :href="it.detail_url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="oldphotos__thumb">
            <img
              :src="it.thumb_url"
              :alt="it.title"
              loading="lazy"
              decoding="async"
            >
            <span v-if="yearText(it)" class="oldphotos__year">{{ yearText(it) }}</span>
          </div>
          <div class="oldphotos__meta">
            <strong>{{ it.title }}</strong>
            <small>{{ it.blurb }}</small>
            <em>在临忆录查看 →</em>
          </div>
        </a>
        <div style="margin-top:8px"><CorrectBtn :item="it.title" :hint="String(it.year || it.era_label || '')" /></div>
      </div>

      <p v-if="!loading && !error && !items.length" class="muted">该年代暂无精选</p>

      <p class="oldphotos__disclaimer muted">
        {{ data?.disclaimer }}
      </p>
    </div>
  </div>
</template>
