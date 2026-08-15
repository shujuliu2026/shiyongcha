<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { apiUrl } from '../utils/api.js'

const plate = ref('')
const line = ref('')
const useNear = ref(false)
const radiusKm = ref(2)
const loading = ref(false)
const error = ref('')
const status = ref(null)
const result = ref(null)

const configured = computed(() => Boolean(status.value?.configured))

async function loadStatus () {
  try {
    const res = await fetch(apiUrl('/api/v1/local/bus/status'))
    status.value = await res.json()
  } catch {
    status.value = { configured: false, setup_hint: '无法连接 API' }
  }
}

async function search () {
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const qs = new URLSearchParams()
    if (plate.value.trim()) qs.set('plate', plate.value.trim())
    if (line.value.trim()) qs.set('line', line.value.trim())
    qs.set('limit', '100')
    if (useNear.value) {
      const pos = await getPosition()
      qs.set('lat', String(pos.lat))
      qs.set('lng', String(pos.lng))
      qs.set('radius_km', String(radiusKm.value || 2))
    }
    const res = await fetch(apiUrl(`/api/v1/local/bus/gps?${qs}`))
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (body.meta) status.value = body.meta
      throw new Error(body.message || body.error || `HTTP ${res.status}`)
    }
    result.value = body
    if (body.meta) status.value = body.meta
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

/**
 * @returns {Promise<{ lat: number, lng: number }>}
 */
function getPosition () {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持定位，请关闭「附近车辆」或用手输线路'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('定位失败，请允许位置权限或关闭「附近车辆」')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 }
    )
  })
}

function mapsLink (item) {
  if (item.lat == null || item.lng == null) return ''
  return `https://uri.amap.com/marker?position=${item.lng},${item.lat}&name=${encodeURIComponent(item.plate || '公交')}`
}

onMounted(() => {
  void loadStatus()
})
</script>

<template>
  <div class="page">
    <SubNav title="临沂公交 GPS" />
    <div class="page__body">
      <p class="lead">
        临沂公共交通集团开放数据：车辆实时 GPS / 进出站状态。
        <RouterLink to="/transit">机场高铁电话</RouterLink>
        ·
        <RouterLink to="/bus-ic">IC卡办理网点</RouterLink>
        ·
        <RouterLink to="/bus-shelters">站亭位置</RouterLink>
      </p>

      <section class="lic-card">
        <h2 class="page__h2">接入状态</h2>
        <p v-if="configured" class="ok">已配置开放网令牌（签名调用），可查询实时车辆。</p>
        <template v-else>
          <p class="err">尚未配置公交 GPS 令牌</p>
          <ol class="about-list">
            <li>打开 <a href="http://lydata.sd.gov.cn/linyi/" target="_blank" rel="noopener">临沂公共数据开放网</a> 注册登录</li>
            <li>用户中心 → 我的令牌 → 获取 <code>Client-Id</code> 与<strong>签名密钥</strong></li>
            <li>申请接口「公交车GPS及站点数据信息查询服务」并等待通过</li>
            <li>
              写入项目根目录 <code>.env</code>：
              <code>LYDATA_CLIENT_ID</code> + <code>LYDATA_CLIENT_SECRET</code>
              后重启 API
            </li>
          </ol>
          <p class="muted">
            状态：Client-Id {{ status?.has_client_id ? '已有' : '缺' }} · Secret
            {{ status?.has_client_secret ? '已有' : '缺' }}
          </p>
          <p class="muted">{{ status?.setup_hint }}</p>
          <p class="muted">
            目录：
            <a
              href="http://lydata.sd.gov.cn/linyi/api/index?filterParam=org_code_enterprise&filterParamCode=9137130016829134XT&page=1"
              target="_blank"
              rel="noopener"
            >公交集团数据服务</a>
          </p>
        </template>
      </section>

      <h2 class="page__h2">查询</h2>
      <div class="form form--bank">
        <label>
          车牌（可选）
          <input v-model="plate" type="text" placeholder="如 鲁Q" autocomplete="off">
        </label>
        <label>
          线路 ID（可选）
          <input v-model="line" type="text" placeholder="接口返回的 line_id" autocomplete="off">
        </label>
        <label class="bus-check">
          <input v-model="useNear" type="checkbox">
          仅看附近车辆（需浏览器定位）
        </label>
        <label v-if="useNear">
          半径（公里）
          <input v-model.number="radiusKm" type="number" min="0.5" max="20" step="0.5">
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="loading" @click="search">
          {{ loading ? '查询中…' : '查询车辆' }}
        </button>
        <button type="button" class="btn btn--ghost" :disabled="loading" @click="loadStatus">刷新状态</button>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="result" class="ok">
        匹配 {{ result.total_matched }} 辆 · 展示 {{ result.count }}
        <template v-if="result.cached"> · 缓存</template>
        · 上游本页 {{ result.upstream_count }} 条
      </p>

      <ul v-if="result?.items?.length" class="batch-list">
        <li v-for="item in result.items" :key="item.id + item.gps_time">
          <div class="batch-list__in">
            <strong>{{ item.plate || '未知车牌' }}</strong>
            <code>线路 {{ item.line_id || '—' }}</code>
            <em v-if="item.distance_km != null">{{ item.distance_km }} km</em>
          </div>
          <div class="batch-list__hit">
            <span class="muted">
              站序 {{ item.station_seq ?? '—' }}
              · {{ item.entry_exit || '进出站—' }}
              · {{ item.up_down || '上下行—' }}
              · {{ item.status || '状态—' }}
            </span>
            <span class="muted">
              {{ item.lat ?? '—' }}, {{ item.lng ?? '—' }}
              · 速 {{ item.speed ?? '—' }}
              · {{ item.gps_time || item.updated_at || '—' }}
            </span>
            <a
              v-if="item.lat != null && item.lng != null"
              class="btn btn--ghost"
              :href="mapsLink(item)"
              target="_blank"
              rel="noopener"
            >地图</a>
          </div>
        </li>
      </ul>
      <p v-else-if="result && !loading" class="muted">无匹配车辆，放宽条件或稍后重试。</p>

      <p class="foot muted">{{ result?.disclaimer || '数据来源：临沂市公共数据开放网 · 公共交通集团。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.bus-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.bus-check input {
  width: auto;
}
</style>
