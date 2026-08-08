<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import BankMap from '../components/BankMap.vue'
import { apiUrl } from '../utils/api.js'
import { useLicense } from '../composables/useLicense.js'

const route = useRoute()
const router = useRouter()

const { hasLicense, statusLabel, authHeaders, refreshStatus } = useLicense()

const props = defineProps({
  localMode: { type: Boolean, default: false }
})

const DISTRICTS = [
  '',
  '兰山区',
  '罗庄区',
  '河东区',
  '沂南县',
  '郯城县',
  '沂水县',
  '兰陵县',
  '费县',
  '平邑县',
  '莒南县',
  '蒙阴县',
  '临沭县',
  '高新区',
  '经开区',
  '临港区',
  '临沂市'
]

const title = computed(() => (props.localMode ? '临沂银行网点' : '银行支行编码'))

const bank = ref(props.localMode ? '' : '中国工商银行')
const province = ref('')
const city = ref(props.localMode ? '临沂' : '')
const district = ref('')
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const result = ref(null)
const meta = ref(null)
const geoStatus = ref(null)
const copied = ref('')
const activeCnaps = ref('')
const locatingCnaps = ref('')
const mapRef = ref(null)
const showMap = ref(true)

const corpusLabel = computed(() => {
  if (!meta.value) return ''
  if (meta.value.full_count) return `全量 ${meta.value.full_count.toLocaleString()} 条`
  return `种子 ${meta.value.seed_count || 0} 条`
})

const mapItems = computed(() => result.value?.items || [])

const geoReadyCount = computed(
  () => (result.value?.items || []).filter((i) => i.lat != null && i.lng != null).length
)

async function loadMeta () {
  try {
    const res = await fetch(apiUrl('/api/v1/info/bank/meta'))
    meta.value = await res.json()
  } catch {
    meta.value = null
  }
}

async function loadGeoStatus () {
  if (!props.localMode) return
  try {
    const res = await fetch(apiUrl('/api/v1/local/bank/geo/status'))
    geoStatus.value = await res.json()
  } catch {
    geoStatus.value = null
  }
}

function syncSearchToUrl () {
  const query = {}
  if (bank.value.trim()) query.bank = bank.value.trim()
  if (!props.localMode && province.value.trim()) query.province = province.value.trim()
  if (!props.localMode && city.value.trim()) query.city = city.value.trim()
  if (props.localMode && district.value) query.district = district.value
  if (keyword.value.trim()) query.keyword = keyword.value.trim()
  router.replace({ query }).catch(() => {})
}

function hydrateFromUrl () {
  const q = route.query
  if (typeof q.bank === 'string') bank.value = q.bank
  if (!props.localMode && typeof q.province === 'string') province.value = q.province
  if (!props.localMode && typeof q.city === 'string') city.value = q.city
  if (props.localMode && typeof q.district === 'string') district.value = q.district
  if (typeof q.keyword === 'string') keyword.value = q.keyword
}

async function search () {
  loading.value = true
  error.value = ''
  copied.value = ''
  try {
    const qs = new URLSearchParams()
    if (bank.value.trim()) qs.set('bank', bank.value.trim())
    if (province.value.trim()) qs.set('province', province.value.trim())
    if (city.value.trim()) qs.set('city', city.value.trim())
    if (props.localMode && district.value) qs.set('district', district.value)
    if (keyword.value.trim()) qs.set('keyword', keyword.value.trim())
    qs.set('limit', props.localMode ? '80' : '40')
    if (props.localMode) qs.set('geo', '1')
    const res = await fetch(apiUrl(`/api/v1/info/bank/cnaps?${qs}`), {
      headers: authHeaders()
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    result.value = body
    if (body.geo) geoStatus.value = body.geo
    if (body.hint) error.value = body.hint
    syncSearchToUrl()
    await nextTick()
    mapRef.value?.invalidate?.()
  } catch (e) {
    result.value = null
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

async function locateItem (item) {
  if (item.lat != null && item.lng != null) {
    activeCnaps.value = item.cnaps
    showMap.value = true
    await nextTick()
    mapRef.value?.focusActive?.()
    return
  }
  locatingCnaps.value = item.cnaps
  error.value = ''
  try {
    const res = await fetch(apiUrl('/api/v1/local/bank/geo/geocode'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ cnaps: item.cnaps, name: item.name, city: '临沂' })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`)
    if (result.value?.items) {
      result.value = {
        ...result.value,
        items: result.value.items.map((row) =>
          row.cnaps === item.cnaps
            ? {
                ...row,
                lat: body.lat,
                lng: body.lng,
                geo_address: body.address,
                geo_provider: body.provider
              }
            : row
        )
      }
    }
    if (body.geo) geoStatus.value = body.geo
    activeCnaps.value = item.cnaps
    showMap.value = true
    await nextTick()
    mapRef.value?.focusActive?.()
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    locatingCnaps.value = ''
  }
}

async function copyText (text) {
  const v = String(text || '')
  if (!v) return
  try {
    await navigator.clipboard.writeText(v)
    copied.value = v
  } catch {
    error.value = '复制失败，请长按手动选择'
  }
}

function mapSearchUrl (item) {
  const q = encodeURIComponent(`${item.name} 临沂`)
  return `https://uri.amap.com/search?keyword=${q}&city=临沂`
}

function onMapSelect (cnaps) {
  activeCnaps.value = cnaps
}

watch(district, () => {
  if (props.localMode) void search()
})

onMounted(async () => {
  hydrateFromUrl()
  if (hasLicense.value) await refreshStatus()
  void loadMeta()
  void loadGeoStatus()
  void search()
})
</script>

<template>
  <div class="page">
    <SubNav
      :title="title"
      :share-desc="localMode ? '临沂联行号与网点地图' : '12 位联行号与支行名称'"
    />
    <div class="page__body">
      <p class="lead">
        <template v-if="localMode">
          临沂本地联行号 + <strong>地图标注</strong>（高德地理编码缓存；底图 OSM/Carto，坐标已转 WGS84）。
          区县由支行名推断。正式汇路以柜台/网银为准。
        </template>
        <template v-else>
          按《银行支行编码》查询 12 位联行号与支行名称。
          本地地图见 <RouterLink to="/local-bank">临沂网点</RouterLink>。
        </template>
        多行对账请用
        <RouterLink to="/bank/batch">批量查询</RouterLink>
        <template v-if="hasLicense"> · 许可证 {{ statusLabel }}</template>。
      </p>
      <p><CorrectBtn :item="localMode ? '临沂银行网点' : '银行支行编码'" :compact="false" /></p>

      <section v-if="localMode" class="lic-card">
        <h2 class="page__h2">地图</h2>
        <p class="muted">
          本页已定位 {{ geoReadyCount }} / {{ result?.items?.length || 0 }} ·
          缓存共 {{ geoStatus?.cache_count ?? '—' }} 点 ·
          高德 Key {{ geoStatus?.amap_configured ? '已配置' : '未配置' }}
        </p>
        <div class="row">
          <button type="button" class="btn btn--ghost" @click="showMap = !showMap">
            {{ showMap ? '收起地图' : '展开地图' }}
          </button>
        </div>
        <BankMap
          v-show="showMap"
          ref="mapRef"
          :items="mapItems"
          :active-cnaps="activeCnaps"
          @select="onMapSelect"
        />
        <p v-if="!geoStatus?.amap_configured" class="muted">
          建议在 <code>.env</code> 配置 <code>AMAP_WEB_KEY</code>，然后运行
          <code>npm run geocode:linyi-banks</code> 批量写缓存。未配置时可对单条点「定位」（Nominatim，较慢）。
        </p>
      </section>

      <div class="form form--bank">
        <label>
          总行名称
          <input v-model="bank" list="bank-list" type="text" placeholder="如：中国工商银行">
          <datalist id="bank-list">
            <option v-for="b in meta?.banks || []" :key="b" :value="b" />
          </datalist>
        </label>
        <label v-if="!localMode">
          地名（省）
          <input v-model="province" type="text" placeholder="匹配支行名称，如：山东">
        </label>
        <label>
          地名（市）
          <input v-model="city" type="text" :readonly="localMode" placeholder="匹配支行名称，如：临沂">
        </label>
        <label v-if="localMode">
          区县（推断）
          <select v-model="district">
            <option v-for="d in DISTRICTS" :key="d || 'all'" :value="d">
              {{ d || '全部区县' }}
            </option>
          </select>
        </label>
        <label>
          关键字 / 联行号
          <input v-model="keyword" type="text" placeholder="支行关键字或 12 位联行号">
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn" :disabled="loading" @click="search">
          {{ loading ? '查询中…' : '查询' }}
        </button>
      </div>

      <p v-if="result?.location_note" class="muted">{{ result.location_note }}</p>
      <p v-if="meta?.hint" class="err">{{ meta.hint }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="copied" class="ok">已复制：{{ copied }}</p>

      <ul v-if="result?.items?.length" class="bank-list">
        <li
          v-for="item in result.items"
          :key="item.cnaps + item.name"
          :class="{ 'bank-list--active': activeCnaps === item.cnaps }"
        >
          <div class="bank-list__main">
            <strong>{{ item.name }}</strong>
            <span class="muted">
              {{ item.bank }}
              <template v-if="item.bank_code"> · 总行号 {{ item.bank_code }}</template>
              <template v-if="item.district"> · <span class="bank-dist">{{ item.district }}</span></template>
              <template v-if="item.lat != null">
                ·
                <span :class="item.geo_provider === 'district_approx' ? 'bank-geo bank-geo--approx' : 'bank-geo'">
                  {{ item.geo_provider === 'district_approx' ? '区县近似' : '已上图' }}
                </span>
              </template>
            </span>
            <code class="bank-list__cnaps">{{ item.cnaps }}</code>
            <span v-if="item.geo_address" class="muted">{{ item.geo_address }}</span>
          </div>
          <div class="bank-list__actions">
            <button type="button" class="btn btn--ghost" @click="copyText(item.cnaps)">复制行号</button>
            <button
              v-if="localMode"
              type="button"
              class="btn btn--ghost"
              :disabled="locatingCnaps === item.cnaps"
              @click="locateItem(item)"
            >
              {{ locatingCnaps === item.cnaps ? '定位中…' : (item.lat != null ? '看地图' : '定位') }}
            </button>
            <a
              v-if="localMode"
              class="btn btn--ghost"
              :href="mapSearchUrl(item)"
              target="_blank"
              rel="noopener"
            >高德搜</a>
          </div>
        </li>
      </ul>
      <p v-else-if="result && !loading" class="muted">无匹配结果，尝试放宽条件或改关键字。</p>
      <p v-if="result?.has_more" class="muted">还有更多结果，请增加银行或区县缩小范围。</p>

      <p class="foot muted">
        {{ result?.disclaimer || '仅供参考，以银行柜台/网银为准。' }}
        <template v-if="result?.source"> · 源 {{ result.source }}</template>
        <template v-if="corpusLabel"> · {{ corpusLabel }}</template>
      </p>
    </div>
  </div>
</template>
