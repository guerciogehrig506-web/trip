<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useCities } from '@/composables/useCities'
import { useConfig } from '@/composables/useConfig'
import type { CityFeature } from '@/types/city'
import CitySheet from './CitySheet.vue'
import PlanTimeline from './PlanTimeline.vue'
import AddFootprintSheet from './AddFootprintSheet.vue'

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
const markerLayer = L.layerGroup()

const { cities, loadCities, loading, source, addCity } = useCities()
const { configVersion } = useConfig()

const emit = defineEmits<{ (e: 'request-config'): void }>()

const sheetOpen = ref(false)
const selectedCity = ref<CityFeature | null>(null)
const plansOpen = ref(false)
const addSheetOpen = ref(false)
const pickedCoord = ref<[number, number] | null>(null)
const savingCity = ref(false)
const addError = ref<string | null>(null)
let pickedMarker: L.Marker | null = null

const searchQuery = ref('')
const visitedOnly = ref(false)
const filterVisible = ref(false)

// 过滤后的城市列表：既用于地图标记，也用于搜索下拉结果
const filteredCities = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return cities.value.filter((feature) => {
    const { name, country, visited } = feature.properties
    if (visitedOnly.value && !visited) return false
    if (q && !name.toLowerCase().includes(q) && !country.toLowerCase().includes(q)) return false
    return true
  })
})

// 搜索下拉是否展示
const showResults = computed(() => searchQuery.value.trim().length > 0)

// Secret config trigger: click the status pill 5 times
const secretClicks = ref(0)
let secretTimer: number | undefined
function onSecretClick() {
  secretClicks.value += 1
  if (secretClicks.value >= 5) {
    secretClicks.value = 0
    emit('request-config')
    return
  }
  window.clearTimeout(secretTimer)
  secretTimer = window.setTimeout(() => {
    secretClicks.value = 0
  }, 1500)
}

// Stats for the top bar
const visitedCount = ref(0)

function buildIcon(visited: boolean): L.DivIcon {
  const color = visited ? '#10b981' : '#f59e0b'
  const ring = visited ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'
  return L.divIcon({
    className: 'city-marker',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:0 0 0 4px ${ring}, 0 1px 3px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function renderMarkers() {
  markerLayer.clearLayers()
  filteredCities.value.forEach((feature) => {
    const { visited } = feature.properties
    const [lng, lat] = feature.geometry.coordinates
    const marker = L.marker([lat, lng], { icon: buildIcon(visited) })
    marker.on('click', () => {
      selectedCity.value = feature
      sheetOpen.value = true
    })
    marker.addTo(markerLayer)
  })
}

function fitFeatures(features: CityFeature[]) {
  if (!map || features.length === 0) return
  const bounds = L.latLngBounds(
    features.map((f) => {
      const [lng, lat] = f.geometry.coordinates
      return [lat, lng] as [number, number]
    }),
  )
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 4 })
}

function fitToCities() {
  fitFeatures(cities.value)
}

function onSelectResult(feature: CityFeature) {
  const [lng, lat] = feature.geometry.coordinates
  map?.flyTo([lat, lng], 10)
  selectedCity.value = feature
  sheetOpen.value = true
  searchQuery.value = ''
}

function performSearch() {
  const results = filteredCities.value
  if (results.length === 0) return
  if (results.length === 1) {
    onSelectResult(results[0])
  } else {
    fitFeatures(results)
  }
}

function locateMe() {
  if (!map) return
  map.locate({ setView: true, maxZoom: 6 })
}

function onLocationFound(e: L.LocationEvent) {
  // In add mode, snap the picked coordinate to the user's location.
  if (addSheetOpen.value) {
    pickedCoord.value = [e.latlng.lng, e.latlng.lat]
    updatePickedMarker()
    map?.flyTo(e.latlng, 12)
  }
}

function onLocationError() {
  // silently fall back to world view
}

function onMapClick(e: L.LeafletMouseEvent) {
  if (!addSheetOpen.value) return
  pickedCoord.value = [e.latlng.lng, e.latlng.lat]
  updatePickedMarker()
}

function updatePickedMarker() {
  if (!map || !pickedCoord.value) return
  if (pickedMarker) pickedMarker.remove()
  const [lng, lat] = pickedCoord.value
  pickedMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'picked-marker',
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 0 0 5px rgba(99,102,241,0.3),0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
  }).addTo(map)
}

function onAddFootprint() {
  sheetOpen.value = false
  addError.value = null
  pickedCoord.value = null
  if (pickedMarker) {
    pickedMarker.remove()
    pickedMarker = null
  }
  addSheetOpen.value = true
}

function onUseLocation() {
  if (!map) return
  map.locate({ setView: true, maxZoom: 12 })
}

async function onSaveFootprint(form: {
  name: string
  country: string
  visited: boolean
}) {
  if (!pickedCoord.value) {
    addError.value = '请先在地图上选择一个位置。'
    return
  }
  savingCity.value = true
  addError.value = null
  try {
    await addCity({
      name: form.name,
      country: form.country,
      coord: pickedCoord.value,
      visited: form.visited,
    })
    addSheetOpen.value = false
    visitedCount.value = cities.value.filter((c) => c.properties.visited).length
    renderMarkers()
    fitToCities()
  } catch (e: any) {
    addError.value = e?.message ?? '保存失败，请重试。'
  } finally {
    savingCity.value = false
    if (pickedMarker) {
      pickedMarker.remove()
      pickedMarker = null
    }
  }
}

watch(filteredCities, () => {
  renderMarkers()
})

// 配置保存/清除后自动重新加载城市数据，
// 使「去配置连接 GitHub」/「添加足迹」按钮与数据源状态同步刷新。
watch(configVersion, async () => {
  await loadCities()
  visitedCount.value = cities.value.filter((c) => c.properties.visited).length
  renderMarkers()
  fitToCities()
})

onMounted(async () => {
  await nextTick()
  if (!mapEl.value) return

  map = L.map(mapEl.value, {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    // Mobile-optimized interaction
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: false, // disable wheel on touch-first UI
    doubleClickZoom: true,
    boxZoom: false,
    keyboard: false,
    worldCopyJump: true,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map)

  markerLayer.addTo(map)

  map.on('locationfound', onLocationFound)
  map.on('locationerror', onLocationError)
  map.on('click', onMapClick)

  // Load cities and render
  await loadCities()
  visitedCount.value = cities.value.filter((c) => c.properties.visited).length
  renderMarkers()
  fitToCities()

  // Ensure map sizing is correct after mount
  setTimeout(() => map?.invalidateSize(), 200)
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden">
    <!-- Map canvas -->
    <div ref="mapEl" class="absolute inset-0 z-0"></div>

    <!-- Top search / status bar -->
    <div class="absolute top-0 left-0 right-0 z-20 pt-safe">
      <div class="px-3 pt-3 pb-2 bg-gradient-to-b from-black/30 to-transparent">
        <div class="flex items-center gap-2">
          <div class="flex-1 flex items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-full shadow-md px-3 py-2">
            <button
              class="text-slate-400 mr-2 shrink-0 active:text-brand-600"
              title="搜索"
              aria-label="搜索"
              @click="performSearch"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <input
              v-model="searchQuery"
              placeholder="搜索城市或国家"
              class="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 min-w-0"
              @keyup.enter="performSearch"
            />
            <button
              v-if="searchQuery"
              class="ml-1 text-xs text-slate-400 px-1.5"
              @click="searchQuery = ''"
            >
              ×
            </button>
            <button
              class="ml-1 text-xs text-slate-500 px-1.5"
              @click="filterVisible = !filterVisible"
            >
              <svg class="w-4 h-4" :class="visitedOnly ? 'text-brand-600' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Search results dropdown -->
        <div
          v-if="showResults"
          class="mt-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg border border-slate-200/60 dark:border-slate-700/60 overflow-hidden max-h-72 overflow-y-auto no-scrollbar"
        >
          <button
            v-for="f in filteredCities"
            :key="f.properties.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0"
            @click="onSelectResult(f)"
          >
            <span
              class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              :class="f.properties.visited ? 'bg-emerald-500' : 'bg-amber-500'"
            ></span>
            <span class="flex-1 min-w-0">
              <span class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ f.properties.name }}</span>
              <span class="ml-2 text-xs text-slate-400">{{ f.properties.country }}</span>
            </span>
            <span class="text-xs text-slate-400 shrink-0">定位</span>
          </button>
          <div v-if="filteredCities.length === 0" class="px-3 py-3 text-sm text-slate-400">
            未找到与「{{ searchQuery }}」匹配的城市
          </div>
        </div>

        <!-- Status pill (5-click to open config) -->
        <div
          class="mt-2 flex items-center justify-between px-1 select-none"
          @click="onSecretClick"
        >
          <div class="flex items-center gap-1.5 text-xs text-white drop-shadow">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            已到访 <b class="text-white">{{ visitedCount }}</b>
          </div>
          <div class="text-xs text-white/80 drop-shadow">
            {{ source === 'github' ? 'GitHub 数据' : '本地示例' }}
          </div>
        </div>

        <!-- Filter chip row -->
        <Transition name="fade">
          <div v-if="filterVisible" class="mt-2 flex gap-2 px-1">
            <button
              class="text-xs px-3 py-1.5 rounded-full backdrop-blur transition-colors"
              :class="visitedOnly ? 'bg-brand-600 text-white' : 'bg-white/80 text-slate-700'"
              @click="visitedOnly = !visitedOnly"
            >
              {{ visitedOnly ? '✓ 只看已到访' : '只看已到访' }}
            </button>
            <button
              class="text-xs px-3 py-1.5 rounded-full bg-white/80 text-slate-700 backdrop-blur"
              @click="fitToCities"
            >
              适配全部
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Loading overlay -->
    <div
      v-if="loading"
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/20"
    >
      <div class="bg-white/90 dark:bg-slate-900/90 rounded-full px-4 py-2 text-sm shadow-lg">
        加载城市数据…
      </div>
    </div>

    <!-- Bottom floating action capsule -->
    <div class="absolute bottom-0 left-0 right-0 z-20 pb-safe">
      <div class="flex justify-center pb-5 px-4">
        <div class="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-full shadow-xl border border-slate-200/60 dark:border-slate-700/60 p-1.5">
          <button
            class="flex items-center justify-center w-10 h-10 rounded-full active:bg-slate-100 dark:active:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="定位"
            @click="locateMe"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6v2m0 16v2m14-10h-2M6 12H4m15.07-7.07l-1.42 1.42M6.34 17.66l-1.42 1.42m12.72 0l-1.42-1.42M6.34 6.34L4.92 4.92" />
            </svg>
          </button>

          <div class="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>

          <button
            class="flex items-center justify-center w-10 h-10 rounded-full active:bg-slate-100 dark:active:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="行程计划"
            @click="plansOpen = true"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>

          <div class="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>

          <button
            class="flex items-center gap-1.5 bg-brand-600 text-white rounded-full pl-3 pr-4 py-2 active:bg-brand-700"
            @click="onAddFootprint"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span class="text-sm font-semibold">添加足迹</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom sheet for city details -->
    <CitySheet v-model="sheetOpen" :city="selectedCity" />

    <!-- Full-screen plans timeline -->
    <PlanTimeline v-model="plansOpen" />

    <!-- Add footprint sheet -->
    <AddFootprintSheet
      v-model="addSheetOpen"
      :coord="pickedCoord"
      :source="source"
      :saving="savingCity"
      :error="addError"
      @save="onSaveFootprint"
      @use-location="onUseLocation"
      @request-config="emit('request-config')"
    />
  </div>
</template>

<style>
/* Leaflet container must fill its parent */
.leaflet-container {
  width: 100%;
  height: 100%;
  background: #aadaff;
  font-family: inherit;
  /* Prevent the page from scrolling while interacting with the map */
  touch-action: none;
}
.city-marker {
  background: transparent;
  border: none;
}
.picked-marker {
  background: transparent;
  border: none;
}
.leaflet-control-attribution {
  font-size: 9px !important;
  background: rgba(255, 255, 255, 0.6) !important;
}
</style>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
