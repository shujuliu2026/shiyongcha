<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const liters = ref(50)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/national/oil'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const region = computed(() => {
  const list = data.value?.regions || []
  return list.find((r) => r.default) || list[0] || null
})

function cost (price) {
  const L = Number(liters.value) || 0
  const p = Number(price) || 0
  return (L * p).toFixed(1)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="油价速查" />
    <div class="page__body">
      <p class="lead">山东（含临沂）成品油最高零售价参考 · 可估箱油费用</p>
      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <template v-if="region">
        <p class="muted">
          执行 {{ data.updated }} 起 · 下窗约 {{ data.next_window || '待定' }}
        </p>

        <ul class="oil-list">
          <li v-for="p in region.prices" :key="p.grade">
            <div>
              <strong>{{ p.grade }} {{ p.product }}</strong>
              <small class="muted">元/升</small>
            </div>
            <span class="oil-list__price">{{ p.yuan_per_liter.toFixed(2) }}</span>
          </li>
        </ul>

        <div class="form form--bank" style="margin-top:14px">
          <label>
            油箱（升）
            <input v-model.number="liters" type="number" min="1" max="120" step="1">
          </label>
        </div>
        <ul class="oil-cost">
          <li v-for="p in region.prices" :key="'c'+p.grade">
            {{ p.grade }} 加满约 <strong>¥{{ cost(p.yuan_per_liter) }}</strong>
          </li>
        </ul>
      </template>

      <div v-if="data?.history?.length" class="local-block">
        <h2 class="page__h2">最近调价</h2>
        <ul class="history-list">
          <li v-for="h in data.history" :key="h.date">
            <strong>{{ h.date }}</strong>
            <span class="muted">92# {{ h.gas92 }} · 95# {{ h.gas95 }} · 0# {{ h.diesel0 }}</span>
          </li>
        </ul>
      </div>

      <p class="foot muted">{{ data?.note }} {{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
