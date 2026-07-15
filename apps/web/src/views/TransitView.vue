<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/transit?city=linyi'))
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
    <SubNav title="本地出行提示" />
    <div class="page__body">
      <p class="lead">
        临沂机场、高铁、长途客运联系方式与地址。
        实时公交见 <RouterLink to="/bus">临沂公交 GPS</RouterLink>；
        IC 卡网点见 <RouterLink to="/bus-ic">办理/充值网点</RouterLink>；
        站亭见 <RouterLink to="/bus-shelters">位置普查</RouterLink>。
      </p>
      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <ul v-if="data?.facilities?.length" class="transit-list">
        <li v-for="f in data.facilities" :key="f.name + f.type">
          <span class="transit-list__type">{{ f.type }}</span>
          <strong>{{ f.name }}</strong>
          <p class="muted">{{ f.address }}</p>
          <p v-if="f.note" class="muted">{{ f.note }}</p>
          <button type="button" class="btn btn--ghost" @click="dial(f.tel)">{{ f.tel }}</button>
        </li>
      </ul>

      <h2 v-if="data?.tips?.length" class="page__h2">出行提示</h2>
      <ul v-if="data?.tips?.length" class="about-list">
        <li v-for="(tip, i) in data.tips" :key="i">{{ tip }}</li>
      </ul>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
