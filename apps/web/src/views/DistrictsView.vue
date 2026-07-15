<script setup>
import { onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/districts?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="区划与邮编" />
    <div class="page__body">
      <p class="lead">{{ data?.city || '临沂' }}区县行政区划代码与常用邮政编码</p>
      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <ul v-if="data?.districts?.length" class="district-table">
        <li class="district-table__head">
          <span>区县</span><span>区划代码</span><span>邮编</span>
        </li>
        <li v-for="d in data.districts" :key="d.code">
          <span>
            <strong>{{ d.name }}</strong>
            <small v-if="d.note" class="muted">{{ d.note }}</small>
          </span>
          <code>{{ d.code }}</code>
          <code>{{ d.zip }}</code>
        </li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
