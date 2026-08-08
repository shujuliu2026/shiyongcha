<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { apiUrl } from '../utils/api.js'

const route = useRoute()
const router = useRouter()

const input = ref('')
const loading = ref(false)
const error = ref('')
const result = ref(null)

/** 仅把 6 位区划码写入 URL，避免身份证号进分享链接 */
function syncShareableQuery (q) {
  const query = { ...route.query }
  if (/^\d{6}$/.test(q)) query.q = q
  else delete query.q
  router.replace({ query }).catch(() => {})
}

async function query () {
  const q = input.value.trim()
  if (!q) {
    error.value = '请输入身份证号或 6 位区划代码'
    result.value = null
    return
  }
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const res = await fetch(apiUrl(`/api/v1/national/id-region?q=${encodeURIComponent(q)}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    if (body.error) throw new Error(body.error)
    result.value = body
    syncShareableQuery(q)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const q = String(route.query.q || '').trim()
  if (/^\d{6}$/.test(q)) {
    input.value = q
    void query()
  }
})
</script>

<template>
  <div class="page">
    <SubNav title="身份证归属" share-desc="区划归属 · 校验位 · 出生日期" />
    <div class="page__body">
      <p class="lead">解析行政区划归属、出生日期与性别位 · 本地校验，不联网核验身份</p>
      <p><CorrectBtn item="身份证归属" :compact="false" /></p>

      <div class="form form--stack">
        <label>
          身份证号 / 区划代码
          <input
            v-model="input"
            type="text"
            inputmode="text"
            maxlength="18"
            placeholder="如 371302XXXXXXXXXXXX 或 371302"
            @keyup.enter="query"
          >
        </label>
        <button type="button" class="btn" :disabled="loading" @click="query">
          {{ loading ? '查询中…' : '查询' }}
        </button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <div v-if="result" class="query-card">
        <p v-if="result.checksum && !result.checksum.ok" class="err">
          {{ result.checksum.message }}
        </p>
        <p v-else-if="result.checksum?.message" class="ok-line">
          {{ result.checksum.message }}
        </p>

        <dl class="kv">
          <template v-if="result.id18">
            <dt>号码</dt>
            <dd><code>{{ result.id18 }}</code></dd>
          </template>
          <template v-if="result.region">
            <dt>归属地</dt>
            <dd><strong>{{ result.region.label }}</strong></dd>
            <dt>区划码</dt>
            <dd>{{ result.region.code }}</dd>
          </template>
          <template v-if="result.birth">
            <dt>出生</dt>
            <dd>{{ result.birth }}</dd>
          </template>
          <template v-if="result.gender">
            <dt>性别位</dt>
            <dd>{{ result.gender }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </div>
</template>
