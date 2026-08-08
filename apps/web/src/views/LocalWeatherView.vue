<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { useTyphoonRadar } from '../composables/useTyphoonRadar.js'

const {
  DEFAULT_WATCH,
  watchLat,
  watchLng,
  alertKm,
  watchLabel,
  loading,
  error,
  storms,
  hasWatch,
  topAlertTier,
  alertBannerText,
  weekForecast,
  weekLoading,
  refreshLite,
  resetWatchToDefault,
  startAutoRefresh,
  stopAutoRefresh
} = useTyphoonRadar({ localOnly: true })

const today = computed(
  () => weekForecast.value?.days?.find((d) => d.is_today) || weekForecast.value?.days?.[0] || null
)

const nearest = computed(() => storms.value[0] || null)

const typhoonSummary = computed(() => {
  if (hasWatch.value && alertBannerText.value) return alertBannerText.value
  const s = nearest.value
  if (!s) return '当前暂无活跃台风'
  const dist = s.distance_km != null ? `${s.distance_km} km` : '距离未知'
  return `${s.name || s.enname || s.tfid} · 距临沂约 ${dist}`
})

const teaserTone = computed(() => {
  if (!hasWatch.value) return 'calm'
  return topAlertTier.value || 'watch'
})

function weatherLink (tfid) {
  const q = { from: 'local-weather' }
  if (tfid) q.tfid = tfid
  return { path: '/weather', query: q }
}

async function reload () {
  resetWatchToDefault()
  await refreshLite()
}

onMounted(async () => {
  watchLat.value = DEFAULT_WATCH.lat
  watchLng.value = DEFAULT_WATCH.lng
  alertKm.value = DEFAULT_WATCH.alertKm
  watchLabel.value = DEFAULT_WATCH.label
  await refreshLite()
  startAutoRefresh(true)
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="page">
    <SubNav title="临沂天气" />
    <div class="page__body">
      <p class="lead">默认临沂 · 一周预报为主 · 台风距离捎带提示</p>
      <p><CorrectBtn item="临沂天气" :compact="false" /></p>

      <section
        v-if="today"
        class="wx-hero"
      >
        <div class="wx-hero__main">
          <div class="wx-hero__temp">
            <b>{{ today.temp_max != null ? today.temp_max : '—' }}°</b>
            <span>/ {{ today.temp_min != null ? today.temp_min : '—' }}°</span>
          </div>
          <div>
            <strong>{{ today.label }}</strong>
            <p>
              今天 {{ today.date_short }}
              · 降水概率 {{ today.precip_prob != null ? `${today.precip_prob}%` : '—' }}
              <template v-if="today.precip_mm != null"> · {{ today.precip_mm }}mm</template>
            </p>
            <small class="muted">
              临沂 · {{ Number(DEFAULT_WATCH.lat).toFixed(3) }}, {{ Number(DEFAULT_WATCH.lng).toFixed(3) }}
            </small>
          </div>
        </div>
        <p
          v-if="today.wind_max != null"
          class="wx-hero__meta muted"
        >
          最大风速约 {{ today.wind_max }} km/h
        </p>
      </section>
      <p
        v-else-if="weekLoading"
        class="muted"
      >
        天气预报加载中…
      </p>
      <p
        v-else
        class="muted"
      >
        暂无预报数据
      </p>

      <h2 class="page__h2">一周预报</h2>
      <div
        v-if="weekForecast?.days?.length"
        class="week week--local"
      >
        <div
          v-for="d in weekForecast.days"
          :key="d.date"
          class="week__day"
          :class="{ 'week__day--today': d.is_today }"
        >
          <span class="week__wd">{{ d.is_today ? '今天' : d.weekday }}</span>
          <span class="week__date">{{ d.date_short }}</span>
          <span class="week__label">{{ d.label }}</span>
          <span class="week__temp">
            <b>{{ d.temp_max != null ? d.temp_max : '—' }}°</b>
            <i>{{ d.temp_min != null ? d.temp_min : '—' }}°</i>
          </span>
          <span class="week__rain">
            雨{{ d.precip_prob != null ? `${d.precip_prob}%` : '—' }}
            <template v-if="d.precip_mm != null"> · {{ d.precip_mm }}mm</template>
          </span>
        </div>
      </div>

      <section
        class="ty-teaser"
        :class="`ty-teaser--${teaserTone}`"
      >
        <div class="ty-teaser__head">
          <h2>台风天气</h2>
          <RouterLink
            class="ty-teaser__link"
            :to="weatherLink(nearest?.tfid)"
          >
            路径地图 ›
          </RouterLink>
        </div>
        <p class="ty-teaser__summary">{{ typhoonSummary }}</p>
        <p
          v-if="hasWatch"
          class="ty-teaser__hint"
        >
          告警阈值 {{ alertKm }} km · 点条目可打开台风页追踪
        </p>
        <ul
          v-if="storms.length"
          class="ty-teaser__list"
        >
          <li
            v-for="s in storms.slice(0, 3)"
            :key="s.tfid"
          >
            <RouterLink :to="weatherLink(s.tfid)">
              <span>
                {{ s.name || s.enname || s.tfid }}
                <em v-if="s.alert_tier_label">{{ s.alert_tier_label }}</em>
              </span>
              <small>
                {{ s.strong || '—' }} ·
                {{ s.distance_km != null ? `${s.distance_km} km` : '—' }}
              </small>
            </RouterLink>
          </li>
        </ul>
        <p
          v-else-if="!loading"
          class="muted"
        >
          暂无活跃台风 · 仍可打开
          <RouterLink :to="weatherLink()">台风天气</RouterLink>
          查看雨层与设置
        </p>
        <p
          v-if="loading"
          class="muted"
        >
          台风数据加载中…
        </p>
      </section>

      <p
        v-if="error"
        class="err"
      >
        {{ error }}
      </p>
      <p class="foot muted">数据仅供参考 · Open-Meteo / 浙江水利厅台风</p>
      <button
        type="button"
        class="btn btn--ghost"
        :disabled="loading || weekLoading"
        @click="reload"
      >
        刷新
      </button>
    </div>
  </div>
</template>
