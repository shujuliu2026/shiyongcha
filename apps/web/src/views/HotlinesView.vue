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
    const res = await fetch(apiUrl('/api/v1/local/hotlines?city=linyi'))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    data.value = body
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function dial (tel) {
  window.location.href = `tel:${tel}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="便民电话" />
    <div class="page__body">
      <p class="lead">临沂常用便民电话 · 紧急求助、政务、公用事业</p>
      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <section v-for="cat in data?.categories || []" :key="cat.name" class="local-block">
        <h2 class="page__h2">{{ cat.name }}</h2>
        <ul class="hotline-list">
          <li v-for="item in cat.items" :key="item.tel + item.name">
            <div class="hotline-list__main">
              <strong>{{ item.name }}</strong>
              <span class="muted">{{ item.note }}</span>
            </div>
            <button type="button" class="btn btn--ghost hotline-list__tel" @click="dial(item.tel)">
              {{ item.tel }}
            </button>
          </li>
        </ul>
      </section>

      <p class="foot muted">{{ data?.disclaimer || '电话仅供参考' }}</p>
    </div>
  </div>
</template>
