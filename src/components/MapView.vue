<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useCities } from '@/composables/useCities'
import type { CityFeature } from '@/types/city'
import CitySheet from './CitySheet.vue'
import PlanTimeline from './PlanTimeline.vue'

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
const markerLayer = L.layerGroup()

const { cities, loadCities, loading, source } = useCities()

const emit = defineEmits<{ (e: 'request-config'): void }>()

const sheetOpen = ref(false)
const selectedCity = ref<CityFeature | null>(null)
const plansOpen = ref(false)
const searchQuery = ref('')
const visitedOnly = ref(false)
const filterVisible = ref(false)

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
const totalCount = ref(0)

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
  const q = searchQuery.value.trim().toLowerCase()
  cities.value.forEach((feature) => {
    const { name, country, visited } = feature.properties
    if (visitedOnly.value && !visited) return
    if (q && !name.toLowerCase().includes(q) && !country.toLowerCase().includes(q)) return

    const [lng, lat] = feature.geometry.coordinates
    const marker = L.marker([lat, lng], { icon: buildIcon(visited) })
    marker.on('click', () => {
      selectedCity.value = feature
      sheetOpen.value = true
    })
    marker.addTo(markerLayer)
  })
}

function fitToCities() {
  if (!map || cities.value.length === 0) return
  const bounds = L.latLngBounds(
    cities.value.map((f) => {
      const [lng, lat] = f.geometry.coordinates
      return [lat, lng] as [number, number]
    }),
  )
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 4 })
}

function locateMe() {
  if (!map) return
  map.locate({ setView: true, maxZoom: 6 })
}

function onLocationFound() {
  // could add a pulse marker here; for now just center
}

function onLocationError() {
  // silently fall back to world view
}

function onAddFootprint() {
  sheetOpen.value = false
  // Placeholder: adding cities will be implemented in a later module.
  window.alert('添加足迹功能将在下一模块实现')
}

watch([searchQuery, visitedOnly], () => {
  renderMarkers()
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

  // Load cities and render
  await loadCities()
  totalCount.value = cities.value.length
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
            <svg class="w-4 h-4 text-slate-400 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              v-model="searchQuery"
              placeholder="搜索城市或国家"
              class="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 min-w-0"
            />
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

        <!-- Status pill (5-click to open config) -->
        <div
          class="mt-2 flex items-center justify-between px-1 select-none"
          @click="onSecretClick"
        >
          <div class="flex items-center gap-1.5 text-xs text-white drop-shadow">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            已到访 <b class="text-white">{{ visitedCount }}</b> / {{ totalCount }}
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
