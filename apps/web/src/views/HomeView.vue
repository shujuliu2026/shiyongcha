<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import TickerBar from '../components/TickerBar.vue'
import { listRecentTools } from '../composables/useAnalytics.js'
import { buildShareText, sharePage } from '../composables/useShare.js'
import { apiUrl } from '../utils/api.js'
import { fetchCatalog, fetchNotices } from '../composables/useOpsPublic.js'

const shareTip = ref('')
let shareTipTimer = 0

async function onShareHome () {
  const result = await sharePage({
    title: '实用查',
    text: buildShareText('实用查', '临沂本地服务 + 全国实用工具'),
    url: window.location.origin + '/'
  })
  shareTip.value =
    result === 'shared' ? '已分享' : result === 'copied' ? '链接已复制' : result === 'failed' ? '分享失败' : ''
  if (shareTip.value) {
    window.clearTimeout(shareTipTimer)
    shareTipTimer = window.setTimeout(() => { shareTip.value = '' }, 1600)
  }
}

const q = ref('')
const activeCat = ref('all')
const recent = ref([])
const todayItems = ref([])
const todayLabel = ref('')
const localTools = ref([])
const nationalTools = ref([])
const categoryDefs = ref([])
const notices = ref([])
const catalogError = ref('')

const LOCAL_CAT_FALLBACK = [
  { id: 'social', label: '人社社保', hint: '区划 · 培训 · 社保卡' },
  { id: 'transit', label: '出行交通', hint: '公交 · 场站 · 驾校' },
  { id: 'life', label: '生活便民', hint: '医院 · 电话 · 邮编' },
  { id: 'agriculture', label: '农业行情', hint: '蔬菜 · 夏粮 · 秋粮' },
  { id: 'weather', label: '气象环境', hint: '天气 · 空气' },
  { id: 'finance', label: '金融银行', hint: '本地网点' }
]

const NATIONAL_CAT = { id: 'national', label: '全国工具', hint: '联行号 · 油价 · 台风' }

function matchTool (t, keyword) {
  if (!keyword) return true
  const hay = `${t.title} ${t.desc} ${t.keys || ''} ${t.path || t.to}`.toLowerCase()
  return keyword.split(/\s+/).filter(Boolean).every((part) => hay.includes(part))
}

const keyword = computed(() => q.value.trim().toLowerCase())

const filteredLocal = computed(() => localTools.value.filter((t) => matchTool(t, keyword.value)))
const filteredNational = computed(() => nationalTools.value.filter((t) => matchTool(t, keyword.value)))

/** 一级分类标签（横向）· 仅展示有工具的类 */
const categoryTabs = computed(() => {
  const locals = (categoryDefs.value.length ? categoryDefs.value : LOCAL_CAT_FALLBACK)
    .map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint || '',
      count: filteredLocal.value.filter((t) => (t.category || 'life') === c.id).length
    }))
    .filter((c) => c.count > 0 || !keyword.value)

  const tabs = [
    {
      id: 'all',
      label: '全部',
      hint: '',
      count: filteredLocal.value.length + filteredNational.value.length
    },
    ...locals.filter((c) => c.count > 0),
    ...(filteredNational.value.length
      ? [{ id: 'national', label: NATIONAL_CAT.label, hint: NATIONAL_CAT.hint, count: filteredNational.value.length }]
      : [])
  ]
  return tabs
})

/** 当前可见的分组：同类分在一起 */
const visibleGroups = computed(() => {
  const defs = categoryDefs.value.length ? categoryDefs.value : LOCAL_CAT_FALLBACK
  const groups = []

  const wantLocal = activeCat.value === 'all' || defs.some((d) => d.id === activeCat.value)
  if (wantLocal && activeCat.value !== 'national') {
    for (const c of defs) {
      if (activeCat.value !== 'all' && activeCat.value !== c.id) continue
      const tools = filteredLocal.value
        .filter((t) => (t.category || 'life') === c.id)
        .slice()
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      if (!tools.length) continue
      groups.push({
        id: c.id,
        label: c.label,
        hint: c.hint || '',
        badge: '临沂',
        tone: 'local',
        tools
      })
    }
  }

  if (activeCat.value === 'all' || activeCat.value === 'national') {
    if (filteredNational.value.length) {
      groups.push({
        id: 'national',
        label: NATIONAL_CAT.label,
        hint: NATIONAL_CAT.hint,
        badge: '全国',
        tone: 'national',
        tools: filteredNational.value.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0))
      })
    }
  }

  return groups
})

const totalHits = computed(() => filteredLocal.value.length + filteredNational.value.length)
const showRecent = computed(() => !keyword.value && activeCat.value === 'all' && recent.value.length > 0)
const historyEnabled = computed(() => localTools.value.some((t) => t.id === 'history-today'))

const noticeTickerItems = computed(() =>
  notices.value.map((n) => ({
    text: [n.title, n.body].filter(Boolean).join(' · '),
    href: n.link_url || undefined,
    level: n.level || 'info'
  }))
)

const historyTickerItems = computed(() => {
  if (keyword.value || !historyEnabled.value || activeCat.value !== 'all') return []
  return todayItems.value.map((it) => ({
    text: todayLabel.value
      ? `${todayLabel.value} · ${it.title}`
      : it.title,
    to: '/history-today'
  }))
})

const showTickers = computed(
  () => noticeTickerItems.value.length > 0 || historyTickerItems.value.length > 0
)

watch(keyword, () => {
  if (activeCat.value !== 'all' && !categoryTabs.value.some((t) => t.id === activeCat.value)) {
    activeCat.value = 'all'
  }
})

function clearSearch () {
  q.value = ''
}

function selectCat (id) {
  activeCat.value = id
}

function toolTo (t) {
  return t.path || t.to
}

async function loadCatalog () {
  try {
    const cat = await fetchCatalog()
    localTools.value = cat.local
    nationalTools.value = cat.national
    categoryDefs.value = cat.categories?.local || LOCAL_CAT_FALLBACK
  } catch (e) {
    catalogError.value = e?.message || String(e)
  }
}

async function loadNotices () {
  notices.value = await fetchNotices()
}

async function loadTodayTeaser () {
  try {
    const res = await fetch(apiUrl('/api/v1/local/history-today'))
    if (!res.ok) return
    const body = await res.json()
    const list = [
      ...(Array.isArray(body.items) ? body.items : []),
      ...(Array.isArray(body.month_highlights) ? body.month_highlights : [])
    ].filter((it) => it?.title)
    if (!list.length) return
    todayLabel.value = body.label || ''
    todayItems.value = list.slice(0, 8).map((it) => ({
      title: it.title,
      summary: it.summary || ''
    }))
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  recent.value = listRecentTools()
  void loadCatalog()
  void loadNotices()
  void loadTodayTeaser()
})
</script>

<template>
  <div class="home">
    <header class="home__hero">
      <img src="/icon.svg" alt="" width="48" height="48">
      <div class="home__hero-text">
        <h1>实用查</h1>
        <p>信息查询 · 按类浏览</p>
      </div>
      <button type="button" class="home__share" aria-label="分享实用查" @click="onShareHome">
        分享
      </button>
      <div v-if="shareTip" class="subnav__toast" role="status">{{ shareTip }}</div>
    </header>

    <div
      v-if="showTickers"
      class="home__tickers"
    >
      <TickerBar
        v-if="noticeTickerItems.length"
        label="公告"
        :items="noticeTickerItems"
        :interval-ms="3600"
      />
      <TickerBar
        v-if="historyTickerItems.length"
        label="史上今天"
        tone="history"
        :items="historyTickerItems"
        :interval-ms="3200"
      />
    </div>

    <div class="home__search">
      <input
        v-model="q"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="搜索工具，如：公交、社保卡、驾校…"
        aria-label="搜索工具"
      >
      <button
        v-if="q"
        type="button"
        class="home__search-clear"
        aria-label="清空"
        @click="clearSearch"
      >
        ×
      </button>
    </div>
    <p v-if="keyword" class="home__search-meta muted">
      匹配 {{ totalHits }} 项
      <template v-if="!totalHits"> · 试试「医院」「联行号」「社保」</template>
    </p>
    <p v-if="catalogError" class="err" style="margin:0 14px 8px">目录加载失败：{{ catalogError }}</p>

    <!-- 一级分类 · 横向标签 -->
    <nav class="home__cats" aria-label="一级分类">
      <div class="home__cats-scroller">
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          class="home__cat-tag"
          :class="{ 'is-active': activeCat === tab.id }"
          @click="selectCat(tab.id)"
        >
          <span>{{ tab.label }}</span>
          <em v-if="tab.count != null">{{ tab.count }}</em>
        </button>
      </div>
    </nav>

    <section v-if="showRecent" class="home__section">
      <h2 class="home__section-title">最近使用</h2>
      <div class="home__recent">
        <RouterLink
          v-for="t in recent"
          :key="t.to"
          :to="t.to"
          class="home__recent-chip"
        >
          <span aria-hidden="true">{{ t.icon || '📌' }}</span>
          {{ t.title }}
        </RouterLink>
      </div>
    </section>

    <!-- 同类成组 -->
    <section
      v-for="group in visibleGroups"
      :id="`cat-${group.id}`"
      :key="group.id"
      class="home__section"
    >
      <h2 class="home__section-title">
        {{ group.label }}
        <span class="home__badge" :class="group.tone === 'national' ? 'home__badge--nat' : ''">
          {{ group.badge }}
        </span>
        <small v-if="group.hint && activeCat === 'all'" class="home__section-hint">{{ group.hint }}</small>
      </h2>
      <div class="home__grid">
        <RouterLink
          v-for="t in group.tools"
          :key="t.id"
          :to="toolTo(t)"
          class="home__card"
          :class="group.tone === 'national' ? 'home__card--national' : 'home__card--local'"
        >
          <span class="home__icon" aria-hidden="true">{{ t.icon }}</span>
          <span class="home__card-body">
            <strong>{{ t.title }}</strong>
            <small>{{ t.desc }}</small>
          </span>
          <span class="home__arrow" aria-hidden="true">›</span>
        </RouterLink>
      </div>
    </section>

    <p v-if="keyword && !totalHits" class="home__empty muted">没有找到相关工具</p>
    <p v-else-if="!visibleGroups.length" class="home__empty muted">该类暂无工具</p>

    <footer class="home__foot">
      <RouterLink to="/feedback">意见反馈</RouterLink>
      <span>·</span>
      <RouterLink to="/about">关于与数据来源</RouterLink>
      <span>·</span>
      <span>数据仅供参考</span>
    </footer>
  </div>
</template>
