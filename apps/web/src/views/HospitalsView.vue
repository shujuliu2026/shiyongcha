<script setup>
import { computed, onMounted, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const loading = ref(true)
const error = ref('')
const data = ref(null)
const q = ref('')

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/hospitals?city=linyi'))
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
  const keyword = q.value.trim()
  const cats = data.value?.categories || []
  if (!keyword) return cats
  return cats
    .map((c) => ({
      ...c,
      items: (c.items || []).filter((it) =>
        [it.name, it.address, it.note, it.level].join(' ').includes(keyword)
      )
    }))
    .filter((c) => c.items.length)
})

function dial (tel) {
  if (!tel) return
  window.location.href = `tel:${tel}`
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <SubNav title="医院速查" />
    <div class="page__body">
      <p class="lead">临沂主要医院电话与地址 · 便民速查</p>

      <label class="form-inline">
        <input v-model="q" type="search" placeholder="搜索医院名 / 区县 / 专科">
      </label>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="err">{{ error }}</p>

      <section v-for="cat in filtered" :key="cat.name" class="local-block">
        <h2 class="page__h2">{{ cat.name }}</h2>
        <ul class="hotline-list">
          <li v-for="item in cat.items" :key="item.name">
            <div class="hotline-list__main">
              <strong>{{ item.name }}</strong>
              <span class="muted">{{ item.level }} · {{ item.note }} · {{ item.address }}</span>
            </div>
            <button
              v-if="item.tel"
              type="button"
              class="btn btn--ghost hotline-list__tel"
              @click="dial(item.tel)"
            >
              {{ item.tel }}
            </button>
          </li>
        </ul>
      </section>

      <p class="foot muted">{{ data?.disclaimer }}</p>
    </div>
  </div>
</template>
