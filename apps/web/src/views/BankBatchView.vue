<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'
import { useLicense } from '../composables/useLicense.js'

const {
  license,
  support,
  hasLicense,
  statusLabel,
  fetchPlans,
  activate,
  refreshStatus,
  clear,
  setLicense,
  authHeaders
} = useLicense()

const codeInput = ref('')
const text = ref('')
const loading = ref(false)
const activating = ref(false)
const error = ref('')
const okMsg = ref('')
const batchResult = ref(null)

const lineCount = computed(() =>
  text.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length
)

const licenseHint = computed(() => {
  if (!license.value) return '批量查询需激活码'
  const L = license.value
  if (L.type === 'count') {
    return `${L.plan_label} · 剩余 ${L.remaining ?? 0} / ${L.quota ?? 0} 次`
  }
  const exp = L.expires_at ? String(L.expires_at).slice(0, 10) : '—'
  return `${L.plan_label} · 有效至 ${exp}`
})

async function onActivate () {
  activating.value = true
  error.value = ''
  okMsg.value = ''
  try {
    await activate(codeInput.value)
    okMsg.value = '激活成功，可开始批量查询'
    codeInput.value = ''
  } catch (e) {
    error.value = e?.message === 'invalid_code' ? '激活码无效' : (e?.message || String(e))
  } finally {
    activating.value = false
  }
}

async function runBatch () {
  if (!hasLicense.value) {
    error.value = '请先激活码，再进行批量查询'
    return
  }
  loading.value = true
  error.value = ''
  okMsg.value = ''
  batchResult.value = null
  try {
    const res = await fetch(apiUrl('/api/v1/info/bank/cnaps/batch'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: text.value, limit_each: 3 })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (body.license) setLicense(body.license)
      throw new Error(body.message || body.error || `HTTP ${res.status}`)
    }
    batchResult.value = body
    if (body.license) setLicense(body.license)
    okMsg.value = `完成 ${body.count} 行，命中 ${body.hit_count} 行`
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function exportCsv () {
  const rows = batchResult.value?.results || []
  if (!rows.length) return
  const lines = ['输入,命中,联行号,联行名称,总行']
  for (const r of rows) {
    const top = r.items?.[0]
    lines.push([
      csvEscape(r.input),
      r.ok ? '是' : '否',
      csvEscape(top?.cnaps || ''),
      csvEscape(top?.name || ''),
      csvEscape(top?.bank || '')
    ].join(','))
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cnaps-batch-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * @param {string} s
 */
function csvEscape (s) {
  const v = String(s || '')
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function fillDemo () {
  text.value = [
    '102473000010',
    '中国工商银行 临沂兰山',
    '中国建设银行 临沂分行',
    '临商银行 兰山'
  ].join('\n')
}

onMounted(async () => {
  await fetchPlans()
  if (hasLicense.value) await refreshStatus()
})
</script>

<template>
  <div class="page">
    <SubNav title="批量联行号" />
    <div class="page__body">
      <p class="lead">
        深挖 15 万支行编码：粘贴多行（联行号 /「银行+关键字」），一次出结果并导出 CSV。
        <RouterLink to="/bank">单条查询</RouterLink>
      </p>

      <!-- 微信客服解锁 -->
      <section class="lic-card">
        <h2 class="page__h2">微信客服解锁激活码</h2>
        <p class="muted">{{ licenseHint }} · 状态 {{ statusLabel }}</p>

        <div class="lic-cs">
          <p>
            <strong>添加微信客服</strong>
            · 微信号
            <code>{{ support?.wechat || '（请配置 CS_WECHAT）' }}</code>
          </p>
          <p class="muted">{{ support?.tip }}</p>
        </div>

        <div class="form form--bank">
          <label>
            激活码
            <input v-model="codeInput" type="text" placeholder="如 SY-XXXX-XXXX-XXXX" autocomplete="off">
          </label>
        </div>
        <div class="row">
          <button type="button" class="btn" :disabled="activating || !codeInput.trim()" @click="onActivate">
            {{ activating ? '激活中…' : '激活' }}
          </button>
          <button v-if="hasLicense" type="button" class="btn btn--ghost" @click="clear">清除本地许可证</button>
        </div>
      </section>

      <!-- 批量输入 -->
      <h2 class="page__h2">批量内容</h2>
      <p class="muted">每行一条：12 位联行号，或「银行名 关键字」。单次最多 {{ support?.batch_max_lines || 200 }} 行。</p>
      <textarea
        v-model="text"
        class="batch-ta"
        rows="10"
        placeholder="102473000010&#10;中国工商银行 临沂兰山&#10;中国建设银行 临沂"
      />
      <div class="row">
        <button type="button" class="btn" :disabled="loading || !lineCount" @click="runBatch">
          {{ loading ? '查询中…' : `批量查询（${lineCount} 行）` }}
        </button>
        <button type="button" class="btn btn--ghost" @click="fillDemo">填入示例</button>
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="!batchResult?.results?.length"
          @click="exportCsv"
        >
          导出 CSV
        </button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="okMsg" class="ok">{{ okMsg }}</p>

      <ul v-if="batchResult?.results?.length" class="batch-list">
        <li v-for="(r, idx) in batchResult.results" :key="idx" :class="{ 'batch-list--miss': !r.ok }">
          <div class="batch-list__in">
            <span class="muted">#{{ idx + 1 }}</span>
            <code>{{ r.input }}</code>
            <em v-if="r.ok">命中 {{ r.items.length }}</em>
            <em v-else class="miss">未命中</em>
          </div>
          <div v-for="it in r.items" :key="it.cnaps" class="batch-list__hit">
            <strong>{{ it.name }}</strong>
            <span class="muted">{{ it.bank }}</span>
            <code class="bank-list__cnaps">{{ it.cnaps }}</code>
          </div>
        </li>
      </ul>

      <p class="foot muted">
        {{ batchResult?.disclaimer || '批量结果仅供参考。' }}
        免费单条查询每日有限；批量需通过微信客服获取激活码解锁。
      </p>
    </div>
  </div>
</template>
