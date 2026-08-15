<script setup>
import { computed, ref } from 'vue'
import SubNav from '../components/SubNav.vue'
import {
  COORD_SYSTEMS,
  convertCoord,
  haversineKm
} from '../utils/coordConvert.js'

const fromSys = ref('wgs84')
const toSys = ref('gcj02')
const lng = ref(118.356)
const lat = ref(35.104)
const copied = ref('')

const out = computed(() => {
  const a = Number(lng.value)
  const b = Number(lat.value)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const [olng, olat] = convertCoord(fromSys.value, toSys.value, a, b)
  return {
    lng: Math.round(olng * 1e7) / 1e7,
    lat: Math.round(olat * 1e7) / 1e7
  }
})

const allPairs = computed(() => {
  const a = Number(lng.value)
  const b = Number(lat.value)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return []
  const systems = ['wgs84', 'gcj02', 'bd09']
  /** @type {Record<string, [number, number]>} */
  const coords = { [fromSys.value]: [a, b] }
  for (const s of systems) {
    if (s === fromSys.value) continue
    coords[s] = convertCoord(fromSys.value, s, a, b)
  }
  return systems.map((s) => ({
    id: s,
    label: COORD_SYSTEMS.find((x) => x.id === s)?.label || s,
    lng: Math.round(coords[s][0] * 1e7) / 1e7,
    lat: Math.round(coords[s][1] * 1e7) / 1e7
  }))
})

const distHint = computed(() => {
  if (!out.value) return ''
  const a = Number(lng.value)
  const b = Number(lat.value)
  const km = haversineKm(b, a, out.value.lat, out.value.lng)
  if (km < 0.001) return '偏移约 0 m（同源）'
  return `相对原点球面偏移约 ${Math.round(km * 1000)} m`
})

async function copyOut () {
  if (!out.value) return
  const text = `${out.value.lng},${out.value.lat}`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
  } catch {
    copied.value = ''
  }
}

function swap () {
  if (!out.value) return
  const ol = out.value.lng
  const oa = out.value.lat
  const fs = fromSys.value
  fromSys.value = toSys.value
  toSys.value = fs
  lng.value = ol
  lat.value = oa
}

function useLinyiGps () {
  fromSys.value = 'wgs84'
  lng.value = 118.356
  lat.value = 35.104
}
</script>

<template>
  <div class="page">
    <SubNav title="坐标转换" />
    <div class="page__body">
      <p class="lead">WGS84（GPS）· GCJ02（高德/国测局）· BD09（百度）互转，可算偏移距离。</p>

      <div class="form form--bank">
        <label>
          源坐标系
          <select v-model="fromSys">
            <option v-for="s in COORD_SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <label>
          目标坐标系
          <select v-model="toSys">
            <option v-for="s in COORD_SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <label>
          经度
          <input v-model.number="lng" type="number" step="0.0000001">
        </label>
        <label>
          纬度
          <input v-model.number="lat" type="number" step="0.0000001">
        </label>
      </div>

      <div class="row">
        <button type="button" class="btn" @click="copyOut">复制结果</button>
        <button type="button" class="btn btn--ghost" @click="swap">互换</button>
        <button type="button" class="btn btn--ghost" @click="useLinyiGps">临沂示例</button>
      </div>

      <div v-if="out" class="coord-out">
        <p>
          结果：
          <code>{{ out.lng }}, {{ out.lat }}</code>
        </p>
        <p class="muted">{{ distHint }}</p>
        <p v-if="copied" class="ok">已复制 {{ copied }}</p>
      </div>

      <h2 class="page__h2">三系对照</h2>
      <ul class="coord-table">
        <li v-for="row in allPairs" :key="row.id">
          <span>{{ row.label }}</span>
          <code>{{ row.lng }}, {{ row.lat }}</code>
        </li>
      </ul>
    </div>
  </div>
</template>
