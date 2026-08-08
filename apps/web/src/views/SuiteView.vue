<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { trackEvent } from '../composables/useAnalytics.js'
import {
  SUITE_BRAND,
  SUITE_CATEGORIES,
  SUITE_HUB_URL,
  SUITE_INTRO,
  SUITE_TAGLINE,
  SUITE_TOOLS,
  suiteCategoryLabel,
  suiteDetailUrl
} from '../data/suiteTools.js'

const filter = ref('all')

const FEATURED_IDS = ['snipdesk', 'ima-sync']

const filtered = computed(() => {
  const list = filter.value === 'all'
    ? SUITE_TOOLS.slice()
    : SUITE_TOOLS.filter((t) => t.category === filter.value)
  return list.slice().sort((a, b) => {
    const ai = FEATURED_IDS.indexOf(a.id)
    const bi = FEATURED_IDS.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
})

const categoryTabs = computed(() => {
  const tabs = [{ id: 'all', label: '全部', count: SUITE_TOOLS.length }]
  for (const c of SUITE_CATEGORIES) {
    const count = SUITE_TOOLS.filter((t) => t.category === c.id).length
    if (count) tabs.push({ id: c.id, label: c.label, count })
  }
  return tabs
})

function hubHost () {
  try {
    return new URL(SUITE_HUB_URL).host
  } catch {
    return 'linyilu.com'
  }
}

function trackSuite (hook, suiteId) {
  trackEvent({
    feature_hook: hook,
    path: '/suite',
    title: `suite_id=${suiteId}|placement=suite_page|download_url=${hubHost()}`
  })
}

function openHub (suiteId = 'hub_more') {
  trackSuite('suite_card_click', suiteId)
  window.open(SUITE_HUB_URL, '_blank', 'noopener,noreferrer')
}

function openDetail (tool) {
  trackSuite('suite_card_click', tool.id)
  window.open(suiteDetailUrl(tool.id), '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  trackSuite('suite_card_impression', 'matrix')
  const hash = (window.location.hash || '').replace(/^#/, '')
  if (hash && SUITE_TOOLS.some((t) => t.id === hash)) {
    const el = document.getElementById(`suite-${hash}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
</script>

<template>
  <div class="page">
    <SubNav
      title="随用宝系列"
      share-desc="本机综合工具介绍与下载"
    />
    <div class="page__body suite">
      <header class="suite__hero">
        <p class="suite__eyebrow">{{ SUITE_BRAND }}系列 · 临忆录出品</p>
        <h2 class="page__h2 suite__brand">{{ SUITE_BRAND }}</h2>
        <p class="lead">{{ SUITE_TAGLINE }}</p>
        <p class="muted">{{ SUITE_INTRO }}</p>
        <div class="suite__actions">
          <button type="button" class="suite__btn suite__btn--primary" @click="openHub('hub_more')">
            前往下载中心
          </button>
        </div>
      </header>

      <nav class="suite__filters" aria-label="软件分类">
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          class="suite__filter"
          :class="{ 'is-active': filter === tab.id }"
          @click="filter = tab.id"
        >
          {{ tab.label }}
          <em>{{ tab.count }}</em>
        </button>
      </nav>

      <section class="suite__list" aria-label="软件介绍">
        <article
          v-for="tool in filtered"
          :id="`suite-${tool.id}`"
          :key="tool.id"
          class="suite__card"
        >
          <div class="suite__card-head">
            <span class="suite__icon" aria-hidden="true">{{ tool.icon }}</span>
            <div class="suite__card-titles">
              <h3>{{ tool.name }}</h3>
              <span class="suite__cat">{{ suiteCategoryLabel(tool.category) }}</span>
            </div>
          </div>
          <p class="suite__blurb">{{ tool.blurb }}</p>
          <ul class="suite__lines">
            <li><strong>Free</strong> {{ tool.freeLine }}</li>
            <li><strong>Pro</strong> {{ tool.proLine }}</li>
          </ul>
          <div class="suite__card-actions">
            <button type="button" class="suite__btn suite__btn--primary" @click="openHub(tool.id)">
              下载
            </button>
            <button type="button" class="suite__btn suite__btn--ghost" @click="openDetail(tool)">
              详细介绍
            </button>
          </div>
        </article>
      </section>

      <p class="suite__note muted">
        下载统一跳转官方 hub（{{ hubHost() }}），不直链安装包。本页仅作介绍与引流，不嵌入备份/截图等桌面能力。
      </p>
    </div>
  </div>
</template>
