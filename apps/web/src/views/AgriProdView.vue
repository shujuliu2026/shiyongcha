<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const kind = ref('veg')
const year = ref('')
const q = ref('')
const hideCity = ref(false)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/agri-prod?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
    if (!year.value && body.years?.length) year.value = body.years[0]
    if (!kind.value && body.kinds?.length) kind.value = body.kinds[0].id
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  return (data.value?.items || []).filter((it) => {
    if (kind.value && it.kind !== kind.value) return false
    if (year.value && it.year !== year.value) return false
    if (hideCity.value && it.is_city) return false
    if (!keyword) return true
    return `${it.district} ${it.kind_label} ${it.year}`.toLowerCase().includes(keyword)
  })
})

function fmt (n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="分县区农业生产" />
    <div class="page__body">
      <p class="lead">
        蔬菜 / 夏粮 / 秋粮 · 分县区产量与播种面积（开放表约 2017–2019）· 共
        {{ data?.count || '—' }} 条。
      </p>

      <div class="env-tabs" role="tablist">
        <button
          v-for="k in data?.kinds || []"
          :key="k.id"
          type="button"
          class="env-tabs__btn"
          :class="{ 'is-active': kind === k.id }"
          @click="kind = k.id"
        >
          {{ k.label }}
        </button>
      </div>

      <div class="form form--bank">
        <label>
          年份
          <select v-model="year">
            <option v-for="y in data?.years || []" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
        <label>
          县区
          <input v-model="q" type="search" placeholder="如 兰山 / 沂水" autocomplete="off">
        </label>
        <label class="form__check">
          <input v-model="hideCity" type="checkbox">
          隐藏全市汇总
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }} 条</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.district }}</strong>
            <span class="muted">{{ item.year }} · {{ item.kind_label }}</span>
          </div>
          <div class="batch-list__hit agri-stats">
            <span>产量 <b>{{ fmt(item.total_ton) }}</b> 吨</span>
            <span>面积 <b>{{ fmt(item.area_mu, 1) }}</b> 亩</span>
            <span>单产 <b>{{ fmt(item.yield_kg_mu) }}</b> 公斤/亩</span>
            <CorrectBtn :item="`${item.district} ${item.kind_label || ''}`" :hint="String(item.year || '')" />
          </div>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>

<style scoped>
.agri-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  font-size: 0.9rem;
}
.agri-stats b {
  font-weight: 600;
}
</style>
