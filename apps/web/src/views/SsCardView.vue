<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const enriching = ref('')
const error = ref('')
const data = ref(null)
const bank = ref('')
const q = ref('')
const copied = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/ss-card?city=linyi'))
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
  const b = bank.value
  return (data.value?.items || []).filter((it) => {
    if (b && it.bank !== b) return false
    if (!keyword) return true
    const blob = `${it.name} ${it.bank} ${it.address || ''} ${it.address_hint || ''} ${it.phone || ''}`.toLowerCase()
    return blob.includes(keyword)
  })
})

const phoneOk = computed(
  () => (data.value?.items || []).filter((it) => it.phone && !/\*{2,}/.test(it.phone)).length
)

function telHref (phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : ''
}

async function enrichOne (item) {
  enriching.value = item.id
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/enrich-place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'ss-card', id: item.id })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    Object.assign(item, body.item || {})
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    enriching.value = ''
  }
}

async function copyText (text) {
  try {
    await navigator.clipboard.writeText(String(text || ''))
    copied.value = String(text || '')
  } catch {
    error.value = '复制失败'
  }
}

function mapsLink (item) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(item.address || item.name)}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="社保卡制卡网点" />
    <div class="page__body">
      <p class="lead">
        社保卡即时制卡网点 · {{ data?.count || '—' }} 处（人社社保类）。
        有电话 {{ phoneOk }} · 办理前请再确认网点状态。
      </p>

      <div class="form form--bank">
        <label>
          银行
          <select v-model="bank">
            <option value="">全部银行</option>
            <option v-for="b in data?.banks || []" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label>
          关键字
          <input v-model="q" type="search" placeholder="网点名 / 区县" autocomplete="off">
        </label>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>
      <p v-if="!loading && data" class="ok">匹配 {{ filtered.length }}</p>

      <ul v-if="filtered.length" class="batch-list">
        <li v-for="item in filtered" :key="item.id">
          <div class="batch-list__in">
            <strong>{{ item.name }}</strong>
            <code>{{ item.bank }}</code>
          </div>
          <div class="batch-list__hit">
            <span v-if="item.address">{{ item.address }}</span>
            <span v-else class="muted">地址脱敏 · {{ item.address_hint || item.address_raw || '—' }}</span>
            <span v-if="item.phone">
              电话
              <a v-if="telHref(item.phone)" class="tel" :href="telHref(item.phone)">{{ item.phone }}</a>
              <span v-else>{{ item.phone }}</span>
            </span>
            <span v-else class="muted">电话暂缺{{ item.phone_raw ? ` · 原表 ${item.phone_raw}` : '' }}</span>
            <div class="row">
              <button
                v-if="!item.address"
                type="button"
                class="btn btn--ghost"
                :disabled="enriching === item.id"
                @click="enrichOne(item)"
              >
                {{ enriching === item.id ? '补全中…' : '联网补全地址' }}
              </button>
              <button
                v-if="item.address"
                type="button"
                class="btn btn--ghost"
                @click="copyText(item.address)"
              >
                复制地址
              </button>
              <button
                v-if="item.phone"
                type="button"
                class="btn btn--ghost"
                @click="copyText(item.phone)"
              >
                复制电话
              </button>
              <a class="btn btn--ghost" :href="mapsLink(item)" target="_blank" rel="noopener">地图</a>
              <CorrectBtn :item="item.name" :hint="`${item.bank || ''} ${item.address || item.address_hint || ''} ${item.phone || ''}`" />
            </div>
          </div>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
