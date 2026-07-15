<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const year = ref('2026')
const checkDate = ref('')
const loading = ref(false)
const error = ref('')
const holidays = ref(null)
const workdayResult = ref(null)

const yearOptions = ['2025', '2026']

async function loadHolidays () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl(`/api/v1/national/holidays?year=${year.value}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    holidays.value = body
  } catch (e) {
    holidays.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function checkWorkday () {
  if (!checkDate.value) {
    workdayResult.value = null
    return
  }
  try {
    const res = await fetch(apiUrl(`/api/v1/national/is-workday?date=${checkDate.value}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    workdayResult.value = body
  } catch {
    workdayResult.value = null
  }
}

const workdayLabel = computed(() => {
  if (!workdayResult.value) return ''
  if (workdayResult.value.is_workday) return '工作日'
  return '休息日'
})

onMounted(() => {
  void loadHolidays()
})

watch(year, () => {
  void loadHolidays()
})
</script>

<template>
  <div class="page">
    <SubNav title="节假日" />
    <div class="page__body">
      <p class="lead">国务院放假安排简化版 · 2025-2026 · 含调休上班日</p>

      <div class="form form--bank">
        <label>
          年度
          <select v-model="year">
            <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
          </select>
        </label>
        <label>
          查某日
          <input v-model="checkDate" type="date" @change="checkWorkday">
        </label>
      </div>

      <p v-if="workdayResult" class="coord-out">
        {{ checkDate }}：<strong>{{ workdayLabel }}</strong>
        <span class="muted">（{{ workdayResult.reason }}）</span>
      </p>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <article v-for="h in holidays?.holidays || []" :key="h.name + year" class="guide-card">
        <h2 class="guide-card__title">{{ h.name }}</h2>
        <p class="guide-card__summary">{{ h.note }}</p>
        <p class="guide-card__dates">
          <code v-for="d in h.dates" :key="d" class="date-chip">{{ d }}</code>
        </p>
      </article>

      <div v-if="holidays?.adjusted_workdays?.length" class="local-block">
        <h2 class="page__h2">调休上班日</h2>
        <p class="guide-card__dates">
          <code v-for="d in holidays.adjusted_workdays" :key="d" class="date-chip date-chip--work">{{ d }}</code>
        </p>
      </div>

      <p class="foot muted">{{ holidays?.disclaimer || '以国务院正式通知为准' }}</p>
    </div>
  </div>
</template>
