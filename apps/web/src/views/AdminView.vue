<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const TOKEN_KEY = 'syc_admin_token'
const router = useRouter()

const token = ref('')
const unlocked = ref(false)
const tab = ref('overview')
const range = ref('today')
const loading = ref(false)
const error = ref('')
const okMsg = ref('')

const overview = ref(null)
const summary = ref(null)
const recent = ref([])
const catalog = ref([])
const notices = ref([])
const feedback = ref([])
const feedbackCounts = ref({})
const fbFilter = ref('')

const noticeDraft = ref({
  title: '',
  body: '',
  level: 'info',
  enabled: true,
  link_url: '',
  link_label: '',
  expires_at: ''
})

const deviceLabel = {
  mobile: '手机',
  tablet: '平板',
  desktop: '桌面',
  unknown: '未知'
}

const typeLabel = {
  bug: '异常',
  suggest: '建议',
  content: '纠错',
  other: '其他'
}

const tabs = [
  { id: 'overview', label: '概况' },
  { id: 'catalog', label: '工具' },
  { id: 'sources', label: '数据源' },
  { id: 'notices', label: '公告' },
  { id: 'feedback', label: '反馈' },
  { id: 'traffic', label: '访问' }
]

const sources = ref([])
const sourceCounts = ref({})
const sourceLegend = ref({})
const sourceMode = ref('')
const sourceQ = ref('')

const modeLabel = {
  realtime: '实时',
  scheduled: '自动',
  manual: '手动'
}

function headers () {
  return { 'X-Admin-Token': token.value.trim(), 'Content-Type': 'application/json' }
}

async function adminFetch (path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
  return body
}

async function unlock () {
  if (!token.value.trim()) {
    error.value = '请输入后台令牌'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await loadAll()
    unlocked.value = true
    localStorage.setItem(TOKEN_KEY, token.value.trim())
  } catch (e) {
    unlocked.value = false
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function loadSources () {
  const qs = new URLSearchParams()
  if (sourceMode.value) qs.set('mode', sourceMode.value)
  if (sourceQ.value.trim()) qs.set('q', sourceQ.value.trim())
  const path = `/api/v1/admin/sources${qs.toString() ? `?${qs}` : ''}`
  const src = await adminFetch(path)
  sources.value = src.sources || []
  sourceCounts.value = src.counts || {}
  sourceLegend.value = src.legend || {}
}

async function loadAll () {
  okMsg.value = ''
  const [ov, sum, rec, cat, note, fb] = await Promise.all([
    adminFetch(`/api/v1/admin/ops/overview?range=${range.value}`),
    adminFetch(`/api/v1/admin/analytics/summary?range=${range.value}`),
    adminFetch('/api/v1/admin/analytics/recent?limit=40'),
    adminFetch('/api/v1/admin/catalog'),
    adminFetch('/api/v1/admin/notices'),
    adminFetch(`/api/v1/admin/feedback?limit=80${fbFilter.value ? `&status=${fbFilter.value}` : ''}`)
  ])
  overview.value = ov
  summary.value = sum
  recent.value = rec.items || []
  catalog.value = cat.tools || []
  notices.value = note.notices || []
  feedback.value = fb.items || []
  feedbackCounts.value = fb.counts || {}
  await loadSources()
}

async function touchSource (id) {
  const note = window.prompt('更新备注（可选）', '内容已改并上线') || ''
  loading.value = true
  error.value = ''
  try {
    const body = await adminFetch(`/api/v1/admin/sources/${encodeURIComponent(id)}/touch`, {
      method: 'POST',
      body: JSON.stringify({ note })
    })
    sources.value = body.sources || []
    sourceCounts.value = body.counts || {}
    okMsg.value = '已标记手动更新'
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

function logout () {
  localStorage.removeItem(TOKEN_KEY)
  token.value = ''
  unlocked.value = false
  overview.value = null
}

function fmtTime (iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return String(iso)
  }
}

async function saveCatalog () {
  loading.value = true
  error.value = ''
  try {
    const body = await adminFetch('/api/v1/admin/catalog', {
      method: 'PUT',
      body: JSON.stringify({ tools: catalog.value })
    })
    catalog.value = body.tools || []
    okMsg.value = '工具目录已保存'
    overview.value = await adminFetch(`/api/v1/admin/ops/overview?range=${range.value}`)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function moveTool (id, direction) {
  loading.value = true
  error.value = ''
  try {
    const body = await adminFetch('/api/v1/admin/catalog/move', {
      method: 'POST',
      body: JSON.stringify({ id, direction })
    })
    catalog.value = body.tools || []
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function publishNotice () {
  if (!noticeDraft.value.title.trim() || !noticeDraft.value.body.trim()) {
    error.value = '公告标题与正文必填'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const payload = {
      notice: {
        ...noticeDraft.value,
        expires_at: noticeDraft.value.expires_at
          ? new Date(noticeDraft.value.expires_at).toISOString()
          : ''
      }
    }
    const body = await adminFetch('/api/v1/admin/notices', {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
    notices.value = body.notices || []
    noticeDraft.value = { title: '', body: '', level: 'info', enabled: true, link_url: '', link_label: '', expires_at: '' }
    okMsg.value = '公告已发布'
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function toggleNotice (n) {
  loading.value = true
  error.value = ''
  try {
    const body = await adminFetch('/api/v1/admin/notices', {
      method: 'PUT',
      body: JSON.stringify({ notice: { ...n, enabled: !n.enabled } })
    })
    notices.value = body.notices || []
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function removeNotice (id) {
  if (!confirm('删除该公告？')) return
  loading.value = true
  error.value = ''
  try {
    const body = await adminFetch(`/api/v1/admin/notices/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    notices.value = body.notices || []
    okMsg.value = '已删除'
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function setFeedbackStatus (id, status) {
  loading.value = true
  error.value = ''
  try {
    await adminFetch(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
    const fb = await adminFetch(
      `/api/v1/admin/feedback?limit=80${fbFilter.value ? `&status=${fbFilter.value}` : ''}`
    )
    feedback.value = fb.items || []
    feedbackCounts.value = fb.counts || {}
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const avgPv = computed(() => {
  const s = summary.value
  if (!s?.days || !s.pv) return 0
  return Math.round(s.pv / s.days)
})

onMounted(() => {
  const saved = localStorage.getItem(TOKEN_KEY) || ''
  if (saved) {
    token.value = saved
    void unlock()
  }
})

watch(range, () => {
  if (unlocked.value) void loadAll().catch((e) => { error.value = e?.message || String(e) })
})

watch(fbFilter, () => {
  if (unlocked.value) {
    void adminFetch(
      `/api/v1/admin/feedback?limit=80${fbFilter.value ? `&status=${fbFilter.value}` : ''}`
    ).then((fb) => {
      feedback.value = fb.items || []
      feedbackCounts.value = fb.counts || {}
    }).catch((e) => { error.value = e?.message || String(e) })
  }
})

watch([sourceMode, sourceQ], () => {
  if (unlocked.value && tab.value === 'sources') {
    void loadSources().catch((e) => { error.value = e?.message || String(e) })
  }
})

watch(tab, (id) => {
  if (unlocked.value && id === 'sources') {
    void loadSources().catch((e) => { error.value = e?.message || String(e) })
  }
})
</script>

<template>
  <div class="page">
    <SubNav title="运营后台" :share="false" :back-to="unlocked ? undefined : '/'" />
    <div class="page__body">
      <p class="lead">展示开关 · 数据源 · 运营统计 · 公告 · 用户反馈</p>

      <div v-if="!unlocked" class="form form--stack">
        <label>
          后台令牌
          <input v-model="token" type="password" placeholder="X-Admin-Token" autocomplete="current-password" @keyup.enter="unlock">
        </label>
        <button type="button" class="btn" :disabled="loading" @click="unlock">
          {{ loading ? '验证中…' : '进入' }}
        </button>
        <p v-if="error" class="err">{{ error }}</p>
        <p class="muted" style="font-size:12px">
          <code>.env</code> 设置 <code>ADMIN_TOKEN</code> 后重启 API。地址 <code>/admin</code>。
          <button type="button" class="linkish" @click="router.push('/')">返回首页</button>
        </p>
      </div>

      <template v-else>
        <div class="admin-tabs" role="tablist">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="admin-tabs__btn"
            :class="{ 'is-active': tab === t.id }"
            @click="tab = t.id"
          >
            {{ t.label }}
            <span v-if="t.id === 'feedback' && feedbackCounts.new" class="admin-tabs__badge">{{ feedbackCounts.new }}</span>
          </button>
        </div>

        <div class="admin-toolbar">
          <select v-model="range" aria-label="统计区间">
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
          <button type="button" class="btn btn--ghost" :disabled="loading" @click="loadAll">刷新</button>
          <button type="button" class="btn btn--ghost" @click="logout">退出</button>
        </div>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="okMsg" class="ok-msg">{{ okMsg }}</p>

        <!-- 概况 -->
        <template v-if="tab === 'overview' && overview">
          <div class="admin-stats">
            <div class="admin-stat">
              <strong>{{ overview.traffic.pv }}</strong>
              <span>PV</span>
            </div>
            <div class="admin-stat">
              <strong>{{ overview.traffic.uv }}</strong>
              <span>UV</span>
            </div>
            <div class="admin-stat">
              <strong>{{ overview.feedback.new }}</strong>
              <span>待处理反馈</span>
            </div>
            <div class="admin-stat">
              <strong>{{ overview.notices.active }}</strong>
              <span>生效公告</span>
            </div>
            <div class="admin-stat">
              <strong>{{ overview.catalog.enabled }}/{{ overview.catalog.total }}</strong>
              <span>上架工具</span>
            </div>
            <div class="admin-stat">
              <strong>{{ avgPv }}</strong>
              <span>均 PV/日</span>
            </div>
          </div>

          <h2 class="page__h2">热门页面</h2>
          <ul class="admin-list">
            <li v-for="p in overview.traffic.top_paths" :key="p.path">
              <div>
                <strong>{{ p.title || p.path }}</strong>
                <small class="muted">{{ p.path }}</small>
              </div>
              <span class="admin-list__n">{{ p.pv }}</span>
            </li>
            <li v-if="!overview.traffic.top_paths?.length" class="muted">暂无访问</li>
          </ul>

          <h2 class="page__h2">最新反馈</h2>
          <ul class="admin-list admin-list--compact">
            <li v-for="f in overview.feedback.recent" :key="f.id">
              <div>
                <strong>{{ typeLabel[f.type] || f.type }} · {{ f.status }}</strong>
                <small class="muted">{{ f.content }}</small>
              </div>
            </li>
            <li v-if="!overview.feedback.recent?.length" class="muted">暂无反馈</li>
          </ul>
        </template>

        <!-- 工具目录 -->
        <template v-if="tab === 'catalog'">
          <p class="muted" style="font-size:12px;margin:0 0 10px">关闭后首页不展示；可调顺序，保存后前台约 30 秒内生效。</p>
          <ul class="admin-catalog">
            <li v-for="(t, i) in catalog" :key="t.id">
              <label class="admin-catalog__toggle">
                <input v-model="t.enabled" type="checkbox">
                <span>{{ t.enabled ? '展示' : '隐藏' }}</span>
              </label>
              <div class="admin-catalog__main">
                <strong>{{ t.icon }} {{ t.title }}</strong>
                <small class="muted">{{ t.group === 'local' ? '本地' : '全国' }} · {{ t.path }} · sort {{ t.sort }}</small>
              </div>
              <div class="admin-catalog__ops">
                <button type="button" class="btn btn--ghost" :disabled="i === 0" @click="moveTool(t.id, 'up')">↑</button>
                <button type="button" class="btn btn--ghost" :disabled="i === catalog.length - 1" @click="moveTool(t.id, 'down')">↓</button>
              </div>
            </li>
          </ul>
          <button type="button" class="btn" :disabled="loading" @click="saveCatalog">保存目录</button>
        </template>

        <!-- 数据源 -->
        <template v-if="tab === 'sources'">
          <p class="muted" style="font-size:12px;margin:0 0 10px">
            实时 {{ sourceCounts.realtime || 0 }} · 自动 {{ sourceCounts.scheduled || 0 }} · 手动 {{ sourceCounts.manual || 0 }}
            · 共 {{ sourceCounts.total || 0 }}
          </p>
          <ul class="admin-list admin-list--compact" style="margin-bottom:12px">
            <li v-for="(txt, k) in sourceLegend" :key="k">
              <div><strong>{{ modeLabel[k] || k }}</strong><small class="muted">{{ txt }}</small></div>
            </li>
          </ul>
          <div class="admin-toolbar">
            <select v-model="sourceMode" aria-label="更新方式">
              <option value="">全部方式</option>
              <option value="realtime">仅实时</option>
              <option value="scheduled">仅自动</option>
              <option value="manual">仅手动</option>
            </select>
            <input v-model="sourceQ" type="search" placeholder="搜名称 / API" style="flex:1;min-width:120px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--input-bg);color:var(--ink)">
          </div>
          <ul class="admin-list">
            <li v-for="s in sources" :key="s.id" class="admin-fb">
              <div>
                <strong>
                  <span
                    class="src-badge"
                    :class="{
                      'src-badge--rt': s.update_mode === 'realtime',
                      'src-badge--auto': s.update_mode === 'scheduled',
                      'src-badge--man': s.update_mode === 'manual'
                    }"
                  >{{ s.update_label }}</span>
                  {{ s.title }}
                </strong>
                <small class="muted">
                  {{ (s.tool_ids || []).join(' · ') || '—' }}
                  <template v-if="s.env"> · Key {{ s.env.ok ? '已配' : '缺' + (s.env.required.length - s.env.present.length) }}</template>
                  <template v-if="s.file_path"> · 文件{{ s.file_exists ? '✓' : '缺' }}</template>
                </small>
                <p v-if="s.endpoint" class="admin-fb__body muted" style="word-break:break-all">API {{ s.endpoint }}</p>
                <p v-if="s.portal" class="admin-fb__body">
                  <a :href="s.portal" target="_blank" rel="noopener noreferrer">来源 / 门户</a>
                </p>
                <p v-if="s.file_path" class="admin-fb__body muted">本地 {{ s.file_path }}</p>
                <p v-if="s.note" class="admin-fb__body muted">{{ s.note }}</p>
                <p v-if="s.needs_manual" class="admin-fb__body">
                  上次手动更新：{{ s.last_manual_at ? fmtTime(s.last_manual_at) : '尚未标记' }}
                  <template v-if="s.last_manual_note"> · {{ s.last_manual_note }}</template>
                </p>
              </div>
              <div class="admin-catalog__ops">
                <a
                  v-if="s.portal"
                  class="btn btn--ghost"
                  :href="s.portal"
                  target="_blank"
                  rel="noopener noreferrer"
                >门户</a>
                <button
                  v-if="s.needs_manual"
                  type="button"
                  class="btn"
                  :disabled="loading"
                  @click="touchSource(s.id)"
                >标记已更新</button>
              </div>
            </li>
            <li v-if="!sources.length" class="muted">无匹配数据源</li>
          </ul>
        </template>

        <!-- 公告 -->
        <template v-if="tab === 'notices'">
          <div class="form form--stack" style="margin-bottom:18px">
            <label>标题 <input v-model="noticeDraft.title" maxlength="80" placeholder="公告标题"></label>
            <label>正文 <textarea v-model="noticeDraft.body" rows="3" maxlength="500" placeholder="公告正文" /></label>
            <label>
              级别
              <select v-model="noticeDraft.level">
                <option value="info">提示</option>
                <option value="warn">警告</option>
                <option value="urgent">紧急</option>
              </select>
            </label>
            <label>链接（选填） <input v-model="noticeDraft.link_url" placeholder="https:// 或 /path"></label>
            <label>链接文案 <input v-model="noticeDraft.link_label" maxlength="40" placeholder="查看详情"></label>
            <label>过期时间（选填） <input v-model="noticeDraft.expires_at" type="datetime-local"></label>
            <label class="admin-inline-check">
              <input v-model="noticeDraft.enabled" type="checkbox"> 立即展示
            </label>
            <button type="button" class="btn" :disabled="loading" @click="publishNotice">发布公告</button>
          </div>

          <h2 class="page__h2">已发布</h2>
          <ul class="admin-list">
            <li v-for="n in notices" :key="n.id">
              <div>
                <strong>{{ n.enabled ? '●' : '○' }} {{ n.title }}</strong>
                <small class="muted">{{ n.level }} · {{ fmtTime(n.published_at) }} · {{ n.body }}</small>
              </div>
              <div class="admin-catalog__ops">
                <button type="button" class="btn btn--ghost" @click="toggleNotice(n)">{{ n.enabled ? '下架' : '上架' }}</button>
                <button type="button" class="btn btn--ghost" @click="removeNotice(n.id)">删</button>
              </div>
            </li>
            <li v-if="!notices.length" class="muted">暂无公告</li>
          </ul>
        </template>

        <!-- 反馈 -->
        <template v-if="tab === 'feedback'">
          <div class="admin-toolbar">
            <select v-model="fbFilter" aria-label="反馈状态">
              <option value="">全部</option>
              <option value="new">待处理</option>
              <option value="read">已读</option>
              <option value="done">已完成</option>
              <option value="spam">垃圾</option>
            </select>
            <span class="muted" style="font-size:12px">
              新 {{ feedbackCounts.new || 0 }} · 共 {{ feedbackCounts.total || 0 }}
            </span>
          </div>
          <ul class="admin-list">
            <li v-for="f in feedback" :key="f.id" class="admin-fb">
              <div>
                <strong>{{ typeLabel[f.type] || f.type }} · {{ f.status }}</strong>
                <small class="muted">{{ fmtTime(f.created_at) }} · {{ f.page || '-' }} · {{ f.contact || '无联系方式' }}</small>
                <p class="admin-fb__body">{{ f.content }}</p>
              </div>
              <div class="admin-catalog__ops">
                <button v-if="f.status === 'new'" type="button" class="btn btn--ghost" @click="setFeedbackStatus(f.id, 'read')">已读</button>
                <button type="button" class="btn btn--ghost" @click="setFeedbackStatus(f.id, 'done')">完成</button>
                <button type="button" class="btn btn--ghost" @click="setFeedbackStatus(f.id, 'spam')">垃圾</button>
              </div>
            </li>
            <li v-if="!feedback.length" class="muted">暂无反馈</li>
          </ul>
        </template>

        <!-- 访问明细 -->
        <template v-if="tab === 'traffic' && summary">
          <div class="admin-stats">
            <div class="admin-stat"><strong>{{ summary.pv }}</strong><span>浏览量 PV</span></div>
            <div class="admin-stat"><strong>{{ summary.uv }}</strong><span>访客 UV</span></div>
            <div class="admin-stat"><strong>{{ summary.top_paths?.length || 0 }}</strong><span>活跃路径</span></div>
          </div>

          <h2 class="page__h2">设备</h2>
          <ul class="admin-list admin-list--compact">
            <li v-for="d in summary.by_device || []" :key="d.name">
              <div><strong>{{ deviceLabel[d.name] || d.name }}</strong></div>
              <span class="admin-list__n">{{ d.pv }}</span>
            </li>
          </ul>

          <h2 class="page__h2">趋势</h2>
          <ul class="history-list">
            <li v-for="d in summary.series || []" :key="d.day">
              <strong>{{ d.day }}</strong>
              <span class="muted">PV {{ d.pv }} · UV {{ d.uv }}</span>
            </li>
          </ul>

          <h2 class="page__h2">最近访问</h2>
          <ul class="admin-list admin-list--compact">
            <li v-for="(e, i) in recent" :key="i">
              <div>
                <strong>{{ e.title || e.path }}</strong>
                <small class="muted">{{ e.path }} · {{ deviceLabel[e.device_type] || e.device_type }} · {{ fmtTime(e.occurred_at) }}</small>
              </div>
            </li>
          </ul>
        </template>
      </template>
    </div>
  </div>
</template>
