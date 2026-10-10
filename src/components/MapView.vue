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

// 地图瓦片源（按序回退）：优先全球通用的 Carto，加载失败自动切换到下一个。
// 注意：高德瓦片仅覆盖中国大陆，国外坐标会返回 HTTP 200 的空白瓦片
// （不会触发 tileerror），因此不能放在首位，否则国外区域会一直空白。
const TILE_PROVIDERS: Array<{ name: string; url: string; opts: L.TileLayerOptions }> = [
  {
    name: 'Carto',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    opts: { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' },
  },
  {
    name: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: { subdomains: 'abc', maxZoom: 19, attribution: '&copy; OpenStreetMap' },
  },
  {
    name: '高德',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    opts: { subdomains: '1234', maxZoom: 18, attribution: '&copy; 高德地图' },
  },
]
let tileLayer: L.TileLayer | null = null
let tileProviderIdx = 0
let tileErrorCount = 0

function applyTileProvider() {
  if (!map) return
  if (tileLayer) map.removeLayer(tileLayer)
  const p = TILE_PROVIDERS[tileProviderIdx]
  tileLayer = L.tileLayer(p.url, p.opts)
  tileLayer.on('tileload', () => {
    tileErrorCount = 0
  })
  tileLayer.on('tileerror', () => {
    tileErrorCount += 1
    // 连续失败达到阈值则切换到下一个瓦片源
    if (tileErrorCount >= 8 && tileProviderIdx < TILE_PROVIDERS.length - 1) {
      tileProviderIdx += 1
      tileErrorCount = 0
      applyTileProvider()
    }
  })
  tileLayer.addTo(map)
}

const { cities, loadCities, loading, source, addCity } = useCities()
const { configVersion, amapKey } = useConfig()

const emit = defineEmits<{ (e: 'request-config'): void }>()

const sheetOpen = ref(false)
const selectedCity = ref<CityFeature | null>(null)
const plansOpen = ref(false)
const addSheetOpen = ref(false)
const pickedCoord = ref<[number, number] | null>(null)
const savingCity = ref(false)
const addError = ref<string | null>(null)
let pickedMarker: L.Marker | null = null

// 选点后逆地理编码结果，用于自动填入表单
const geoSuggest = ref<{ name: string; country: string } | null>(null)
const geocoding = ref(false)
let geocodeSeq = 0

const searchQuery = ref('')
const visitedOnly = ref(false)
const filterVisible = ref(false)

// 全网搜索（优先高德，回退 Photon/Nominatim）：用于搜索未保存的城市，如「北京/北京市/BeiJing」
interface GeoSearchResult {
  name: string
  country: string
  lat: number
  lng: number
  display: string
}
const globalResults = ref<GeoSearchResult[]>([])
const searching = ref(false)
let searchSeq = 0

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
  globalResults.value = []
}

function onSelectGlobal(r: GeoSearchResult) {
  map?.flyTo([r.lat, r.lng], 10)
  searchQuery.value = ''
  globalResults.value = []
  addError.value = null
}

const MUNICIPALITIES = ['北京市', '上海市', '天津市', '重庆市']

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * 高德地图正向搜索（输入提示）：与高德 App 搜索框一致的联想逻辑，
 * 支持中文/拼音，结果含坐标。未配置 Key 时返回空数组（回退到其它源）。
 */
async function forwardAmap(q: string): Promise<GeoSearchResult[]> {
  const key = amapKey.value.trim()
  if (!key) return []
  const data = await fetchJson(
    `https://restapi.amap.com/v3/assistant/inputtips?keywords=${encodeURIComponent(
      q,
    )}&key=${encodeURIComponent(key)}`,
  )
  if (String(data?.status) !== '1') return []
  const tips: any[] = Array.isArray(data.tips) ? data.tips : []
  return tips
    .map((t) => {
      const [lng, lat] = String(t.location ?? '')
        .split(',')
        .map((n: string) => Number(n))
      const name = t.name ?? ''
      const district = t.district ?? ''
      if (!name || !isFinite(lng) || !isFinite(lat)) return null
      return {
        name,
        country: district,
        lat,
        lng,
        display: [name, district, t.address].filter(Boolean).join(' · '),
      } as GeoSearchResult
    })
    .filter((r): r is GeoSearchResult => r !== null)
}

/**
 * 正向地理编码：优先 Photon（免 key、更快），失败回退 Nominatim。
 * 支持中文（北京/北京市）与拼音/英文（BeiJing）。
 */
async function forwardPhoton(q: string): Promise<GeoSearchResult[]> {
  const data = await fetchJson(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=zh`,
  )
  const features: any[] = Array.isArray(data?.features) ? data.features : []
  return features.map((f) => {
    const p = f.properties ?? {}
    const [lng, lat] = f.geometry?.coordinates ?? [0, 0]
    return {
      name: p.city || p.name || '',
      country: p.country || '',
      lat: Number(lat),
      lng: Number(lng),
      display: [p.name, p.city, p.state, p.country].filter(Boolean).join(' · '),
    }
  })
}

async function forwardNominatim(q: string): Promise<GeoSearchResult[]> {
  const data = await fetchJson(
    'https://nominatim.openstreetmap.org/search?format=jsonv2' +
      `&q=${encodeURIComponent(q)}&limit=8&addressdetails=1&accept-language=zh`,
  )
  return data.map((d: any) => {
    const a: Record<string, string> = d.address ?? {}
    return {
      name: a.city || a.town || a.village || a.municipality || a.county || d.name || '',
      country: a.country || '',
      lat: Number(d.lat),
      lng: Number(d.lon),
      display: d.display_name || '',
    }
  })
}

async function forwardSearch(q: string): Promise<GeoSearchResult[]> {
  const providers = [forwardAmap, forwardPhoton, forwardNominatim]
  for (const p of providers) {
    try {
      const r = await p(q)
      if (r.length) return r
    } catch {
      // 尝试下一个提供商
    }
  }
  return []
}

async function runSearch() {
  const q = searchQuery.value.trim()
  const seq = ++searchSeq
  if (!q) {
    globalResults.value = []
    searching.value = false
    return
  }
  searching.value = true
  try {
    const results = await forwardSearch(q)
    if (seq === searchSeq) globalResults.value = results
  } catch {
    if (seq === searchSeq) globalResults.value = []
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

function performSearch() {
  const q = searchQuery.value.trim()
  if (q) maybePromptAmapKey()
  // 本地已保存的足迹若唯一匹配，直接定位；否则触发全网搜索。
  const results = filteredCities.value
  if (q && results.length === 1) {
    onSelectResult(results[0])
    return
  }
  runSearch()
}

// 首次未配置高德 Key 时，搜索后自动提示一次配置弹窗（会话内仅提示一次）
let amapPrompted = false
function maybePromptAmapKey() {
  if (amapKey.value.trim() || amapPrompted) return
  amapPrompted = true
  emit('request-config')
}

function onLocationFound(e: L.LocationEvent) {
  // In add mode, snap the picked coordinate to the user's location.
  if (addSheetOpen.value) {
    pickedCoord.value = [e.latlng.lng, e.latlng.lat]
    updatePickedMarker()
    map?.flyTo(e.latlng, 12)
    fillFromCoord(e.latlng.lng, e.latlng.lat)
  }
}

function onLocationError() {
  // silently fall back to world view
}

function onMapClick(e: L.LeafletMouseEvent) {
  if (!addSheetOpen.value) return
  pickedCoord.value = [e.latlng.lng, e.latlng.lat]
  updatePickedMarker()
  fillFromCoord(e.latlng.lng, e.latlng.lat)
}

/**
 * 高德逆地理编码：坐标 → 城市名 + 国家，面向中文区域更精准。
 * 直辖市（北京/上海/天津/重庆）city 为空时回退到 province。
 * 未配置 Key 或坐标不在国内时返回空，交由后续回退源处理。
 */
async function reverseAmap(
  lat: number,
  lng: number,
): Promise<{ name: string; country: string }> {
  const key = amapKey.value.trim()
  if (!key) return { name: '', country: '' }
  const data = await fetchJson(
    `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${encodeURIComponent(
      key,
    )}&extensions=base`,
  )
  if (String(data?.status) !== '1') return { name: '', country: '' }
  const ac = data?.regeocode?.addressComponent ?? {}
  let name = ac.city || ''
  if (!name && MUNICIPALITIES.includes(ac.province)) name = ac.province
  return { name, country: ac.country || '' }
}

/**
 * 逆地理编码：把坐标映射为城市名 + 国家，用于自动填表。
 * 只要坐标落在某城市的行政范围内，即返回该城市名（无需精确到某建筑）。
 * 优先 BigDataCloud（免 key、CDN 加速），失败回退 Nominatim。
 */
async function reverseBigDataCloud(
  lat: number,
  lng: number,
): Promise<{ name: string; country: string }> {
  const d = await fetchJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
  )
  let name: string = d?.city || d?.locality || ''
  if (!name && MUNICIPALITIES.includes(d?.principalSubdivision)) {
    // 直辖市坐标落在区县时，principalSubdivision 即城市级行政区
    name = d.principalSubdivision
  }
  return { name, country: d?.countryName || '' }
}

async function reverseNominatim(
  lat: number,
  lng: number,
): Promise<{ name: string; country: string }> {
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=zh`,
  )
  const a: Record<string, string> = data?.address ?? {}
  let name =
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.county ||
    a.state_district ||
    a.suburb ||
    a.hamlet ||
    ''
  if (!name && a.state && MUNICIPALITIES.includes(a.state)) name = a.state
  return { name, country: a.country || '' }
}

async function reverseGeocode(
  lng: number,
  lat: number,
): Promise<{ name: string; country: string }> {
  const providers = [reverseAmap, reverseBigDataCloud, reverseNominatim]
  for (const p of providers) {
    try {
      const r = await p(lat, lng)
      if (r.name || r.country) return r
    } catch {
      // 尝试下一个提供商
    }
  }
  throw new Error('无法识别该位置')
}

async function fillFromCoord(lng: number, lat: number) {
  const seq = ++geocodeSeq
  geocoding.value = true
  geoSuggest.value = null
  try {
    const s = await reverseGeocode(lng, lat)
    if (seq === geocodeSeq) geoSuggest.value = s
  } catch {
    // 识别失败时保留表单，交由用户手动填写
    if (seq === geocodeSeq) geoSuggest.value = null
  } finally {
    if (seq === geocodeSeq) geocoding.value = false
  }
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

// 表单输入地区名 → 反向同步地图选点（正向地理编码）
let geocodeLocSeq = 0
async function geocodeToCoord(query: string) {
  const q = query.trim()
  if (!q || !map) return
  const seq = ++geocodeLocSeq
  try {
    const results = await forwardSearch(q)
    if (seq !== geocodeLocSeq || results.length === 0) return
    const r = results[0]
    pickedCoord.value = [r.lng, r.lat]
    updatePickedMarker()
    map?.flyTo([r.lat, r.lng], 10)
  } catch {
    // 忽略正向地理编码失败，用户仍可在地图上手动选点
  }
}

function onAddFootprint() {
  sheetOpen.value = false
  addError.value = null
  pickedCoord.value = null
  geoSuggest.value = null
  geocoding.value = false
  geocodeSeq += 1
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

async function onDeleted() {
  sheetOpen.value = false
  selectedCity.value = null
  visitedCount.value = cities.value.filter((c) => c.properties.visited).length
  renderMarkers()
  fitToCities()
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

  applyTileProvider()

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
          <!-- 全网搜索中 -->
          <div v-if="searching" class="px-3 py-3 text-sm text-brand-600/80 animate-pulse">
            全网搜索中…
          </div>

          <!-- 已保存足迹的匹配结果 -->
          <button
            v-for="f in filteredCities"
            :key="'saved-' + f.properties.id"
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

          <!-- 全网搜索结果 -->
          <div v-if="globalResults.length" class="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-400">
            全网城市
          </div>
          <button
            v-for="(r, i) in globalResults"
            :key="'global-' + i"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0"
            @click="onSelectGlobal(r)"
          >
            <span class="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-sky-500"></span>
            <span class="flex-1 min-w-0">
              <span class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ r.name || r.display }}</span>
              <span v-if="r.country" class="ml-2 text-xs text-slate-400">{{ r.country }}</span>
            </span>
            <span class="text-xs text-slate-400 shrink-0">定位</span>
          </button>

          <!-- 无结果 -->
          <div
            v-if="!searching && filteredCities.length === 0 && globalResults.length === 0"
            class="px-3 py-3 text-sm text-slate-400"
          >
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

    <!-- Locate status toast removed: bottom-bar locate button is now inert -->

    <!-- Bottom floating action capsule -->
    <div class="absolute bottom-0 left-0 right-0 z-20 pb-safe">
      <div class="flex justify-center pb-5 px-4">
        <div class="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-full shadow-xl border border-slate-200/60 dark:border-slate-700/60 p-1.5">
          <button
            class="flex items-center justify-center w-10 h-10 rounded-full active:bg-slate-100 dark:active:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="定位（暂不可用）"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
          </button>

          <div class="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>

          <button
            class="flex items-center gap-1.5 h-10 rounded-full pl-3 pr-3 active:bg-slate-100 dark:active:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="行程计划"
            @click="plansOpen = true"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span class="text-sm font-medium">行程计划</span>
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
    <CitySheet v-model="sheetOpen" :city="selectedCity" @deleted="onDeleted" />

    <!-- Full-screen plans timeline -->
    <PlanTimeline v-model="plansOpen" @request-config="emit('request-config')" />

    <!-- Add footprint sheet -->
    <AddFootprintSheet
      v-model="addSheetOpen"
      :coord="pickedCoord"
      :source="source"
      :saving="savingCity"
      :error="addError"
      :geosuggest="geoSuggest"
      :geocoding="geocoding"
      @save="onSaveFootprint"
      @use-location="onUseLocation"
      @geocode-loc="geocodeToCoord"
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
