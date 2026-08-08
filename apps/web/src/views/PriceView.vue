<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const tab = ref('egg')
const product = ref('150010')
const province = ref('山东')
const city = ref('')
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const meta = ref(null)
const result = ref(null)

const currentCategory = computed(() =>
  (meta.value?.categories || []).find((c) => c.key === tab.value) || null
)

const productOptions = computed(() => currentCategory.value?.products || [])

watch(tab, (key) => {
  const first = (meta.value?.categories || []).find((c) => c.key === key)?.products?.[0]
  product.value = first?.id || ''
  error.value = ''
  void search()
})

async function loadMeta () {
  try {
    const res = await fetch(apiUrl('/api/v1/info/price/meta'))
    meta.value = await res.json()
    if (!product.value && meta.value?.default_product) {
      product.value = meta.value.default_product
    }
    if (!province.value && meta.value?.default_province) {
      province.value = meta.value.default_province
    }
  } catch {
    meta.value = null
  }
}

async function search () {
  loading.value = true
  error.value = ''
  try {
    const qs = new URLSearchParams()
    qs.set('category', tab.value)
    if (product.value.trim()) qs.set('product', product.value.trim())
    if (province.value.trim()) qs.set('province', province.value.trim())
    if (city.value.trim()) qs.set('city', city.value.trim())
    if (keyword.value.trim()) qs.set('keyword', keyword.value.trim())
    qs.set('limit', '40')
    const res = await fetch(apiUrl(`/api/v1/info/price/query?${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    result.value = body
  } catch (e) {
    result.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function formatChange (pct) {
  if (pct == null || Number.isNaN(Number(pct))) return '—'
  const n = Number(pct)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}%`
}

function changeClass (pct) {
  if (pct == null) return ''
  if (Number(pct) > 0) return 'price-up'
  if (Number(pct) < 0) return 'price-down'
  return ''
}

onMounted(async () => {
  await loadMeta()
  void search()
})
</script>

<template>
  <div class="page">
    <SubNav title="菜蛋肉价" />
    <div class="page__body">
      <p class="lead">
        商务部「商务预报」批发监测：鸡蛋、肉类、蔬菜日度价（元/公斤）。默认筛山东市场。
      </p>
      <p><CorrectBtn item="菜蛋肉价" hint="商务预报批发价" :compact="false" /></p>

      <div class="env-tabs" role="tablist">
        <button
          type="button"
          class="env-tabs__btn"
          :class="{ 'is-active': tab === 'egg' }"
          @click="tab = 'egg'"
        >
          鸡蛋
        </button>
        <button
          type="button"
          class="env-tabs__btn"
          :class="{ 'is-active': tab === 'meat' }"
          @click="tab = 'meat'"
        >
          肉类
        </button>
        <button
          type="button"
          class="env-tabs__btn"
          :class="{ 'is-active': tab === 'veg' }"
          @click="tab = 'veg'"
        >
          蔬菜
        </button>
      </div>

      <div class="form form--bank">
        <label>
          品种
          <select v-model="product">
            <option v-for="p in productOptions" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </label>
        <label>
          地区
          <input v-model="province" type="text" placeholder="如：山东 / 北京">
        </label>
        <label>
          城市/市场
          <input v-model="city" type="text" placeholder="如：青岛 / 淄博（可空）">
        </label>
        <label>
          关键字
          <input v-model="keyword" type="text" placeholder="市场名关键字">
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn" :disabled="loading" @click="search">
          {{ loading ? '查询中…' : '查询' }}
        </button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <template v-if="result">
        <p class="muted">
          {{ result.product }} · 共 {{ result.total ?? result.items?.length ?? 0 }} 条
          <template v-if="result.cached"> · 缓存</template>
        </p>
        <ul v-if="result.items?.length" class="bank-list">
          <li v-for="(item, i) in result.items" :key="(item.market || '') + item.region + i">
            <div class="bank-list__main">
              <strong>
                {{ item.price != null ? item.price : '—' }}
                <span class="muted">{{ item.unit || '元/公斤' }}</span>
                <span class="price-chg" :class="changeClass(item.change_pct)">
                  {{ formatChange(item.change_pct) }}
                </span>
              </strong>
              <span class="muted">{{ item.region }} · {{ item.market }}</span>
              <span v-if="item.prev_price != null" class="muted">昨 {{ item.prev_price }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="muted">无匹配。可清空城市，或把地区留空查全国。</p>
      </template>

      <p class="foot muted">
        {{ result?.disclaimer || meta?.disclaimer || '仅供参考。' }}
        <template v-if="meta?.source?.note">
          <br>{{ meta.source.note }}
        </template>
      </p>
    </div>
  </div>
</template>
