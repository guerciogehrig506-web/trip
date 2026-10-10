<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  /** 当前在地图上选中的坐标 [lng, lat] */
  coord: [number, number] | null
  source: 'github' | 'local'
  saving: boolean
  error?: string | null
  /** 逆地理编码建议（选点后自动识别的城市/国家） */
  geosuggest?: { name: string; country: string } | null
  geocoding?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', form: { name: string; country: string; visited: boolean }): void
  (e: 'use-location'): void
  (e: 'geocode-loc', query: string): void
  (e: 'request-config'): void
}>()

const name = ref('')
const country = ref('')
const visited = ref(true)

// 可拖拽抽屉：通过顶部把手上下滑动，调整表单在屏幕上的显示占比
const SHEET_MIN = 14
const SHEET_MAX = 88
const SHEET_DEFAULT = 45
const sheetPct = ref(SHEET_DEFAULT)
let dragging = false
let startY = 0
let startPct = SHEET_DEFAULT

const coordText = computed(() => {
  if (!props.coord) return ''
  const [lng, lat] = props.coord
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
})

const suggestText = computed(() => {
  if (!props.geosuggest) return ''
  return [props.geosuggest.country, props.geosuggest.name].filter(Boolean).join(' · ')
})

const canSubmit = computed(
  () =>
    props.source === 'github' &&
    name.value.trim().length > 0 &&
    props.coord !== null,
)

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      name.value = ''
      country.value = ''
      visited.value = true
      sheetPct.value = SHEET_DEFAULT
    }
  },
)

// 选点成功后自动把抽屉拉高，方便查看坐标与填写表单
watch(
  () => props.coord,
  (c) => {
    if (c && sheetPct.value < 62) sheetPct.value = 62
  },
)

function clampPct(v: number) {
  return Math.min(SHEET_MAX, Math.max(SHEET_MIN, v))
}

function onDragStart(e: PointerEvent) {
  dragging = true
  startY = e.clientY
  startPct = sheetPct.value
  const el = e.currentTarget as HTMLElement
  if (typeof el.setPointerCapture === 'function') {
    el.setPointerCapture(e.pointerId)
  }
}

function onDragMove(e: PointerEvent) {
  if (!dragging) return
  const dy = startY - e.clientY // 上滑为正（拉高）
  const dpct = (dy / window.innerHeight) * 100
  sheetPct.value = clampPct(startPct + dpct)
}

function onDragEnd() {
  dragging = false
}

// 选点后自动填入逆地理编码识别的城市与国家（自动填表时勿触发反向搜索）
let autoFilling = false
watch(
  () => props.geosuggest,
  (s) => {
    if (!s) return
    autoFilling = true
    if (s.name) name.value = s.name
    if (s.country) country.value = s.country
    window.setTimeout(() => {
      autoFilling = false
    }, 350)
  },
)

// 用户手输地区名 → 通知地图正向地理编码并同步选点（输入防抖）
let geocodeTimer: number | undefined
watch([name, country], ([n, c]) => {
  if (autoFilling) return
  const q = [n, c].filter(Boolean).join(' ').trim()
  if (!q) return
  window.clearTimeout(geocodeTimer)
  geocodeTimer = window.setTimeout(() => {
    emit('geocode-loc', q)
  }, 600)
})

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!canSubmit.value) return
  emit('save', {
    name: name.value.trim(),
    country: country.value.trim(),
    visited: visited.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-end justify-center pointer-events-none"
      >
        <!-- Backdrop：仅视觉变暗，点击穿透到地图以便选点 -->
        <div class="absolute inset-0 bg-black/30 pointer-events-none"></div>

        <!-- Sheet -->
        <div
          class="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
          :style="{ height: sheetPct + 'vh' }"
        >
          <!-- Drag handle -->
          <div
            class="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
            style="touch-action: none"
            @pointerdown="onDragStart"
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragEnd"
          >
            <div class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
          </div>

          <div class="px-5 pt-1 overflow-y-auto no-scrollbar flex-1">
            <!-- Header -->
            <div class="flex items-start justify-between mb-3">
              <div>
                <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">添加足迹</h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">标记一个去过的或计划去的地方</p>
              </div>
              <button
                class="text-slate-400 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                ×
              </button>
            </div>

            <!-- 未连接引导 -->
            <div
              v-if="source === 'local'"
              class="mb-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
            >
              当前为本地示例数据，保存足迹需先连接 GitHub 仓库。
            </div>

            <!-- 位置 -->
            <div class="mb-4">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">位置</h3>
              <div class="flex items-center gap-2">
                <div
                  class="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <svg class="w-4 h-4 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span v-if="coordText" class="font-mono">{{ coordText }}</span>
                  <span v-else class="text-slate-400">点击上方地图选择位置</span>
                </div>
              </div>
              <p v-if="geocoding" class="mt-1.5 text-xs text-brand-600/80 animate-pulse">
                正在识别位置…
              </p>
              <p v-else-if="suggestText" class="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                已识别：{{ suggestText }}
              </p>
              <button
                class="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 active:opacity-60"
                @click="emit('use-location')"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6v2m0 16v2m14-10h-2M6 12H4m15.07-7.07l-1.42 1.42M6.34 17.66l-1.42 1.42m12.72 0l-1.42-1.42M6.34 6.34L4.92 4.92" />
                </svg>
                使用我的当前位置
              </button>
            </div>

            <!-- 城市名 -->
            <div class="mb-3">
              <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">城市名</label>
              <input
                v-model="name"
                type="text"
                placeholder="例如：京都"
                class="w-full rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
              />
            </div>

            <!-- 国家 -->
            <div class="mb-3">
              <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">国家 / 地区</label>
              <input
                v-model="country"
                type="text"
                placeholder="例如：日本"
                class="w-full rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
              />
            </div>

            <!-- 状态 -->
            <div class="mb-5">
              <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">状态</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  class="rounded-xl py-2.5 text-sm font-medium transition-colors"
                  :class="
                    visited
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  "
                  @click="visited = true"
                >
                  已到访
                </button>
                <button
                  class="rounded-xl py-2.5 text-sm font-medium transition-colors"
                  :class="
                    !visited
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  "
                  @click="visited = false"
                >
                  计划中
                </button>
              </div>
            </div>

            </div>

          <!-- 固定底部操作区（始终可见，不随内容滚动） -->
          <div class="shrink-0 px-5 pt-3 pb-6 bg-white dark:bg-slate-900">
            <p v-if="error" class="mb-2 text-sm text-rose-500">{{ error }}</p>
            <button
              v-if="source === 'github'"
              class="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!canSubmit || saving"
              @click="submit"
            >
              {{ saving ? '保存中…' : '保存足迹' }}
            </button>
            <button
              v-else
              class="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700"
              @click="emit('request-config')"
            >
              去配置连接 GitHub
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.3s ease;
}
.sheet-enter-active > div:last-child,
.sheet-leave-active > div:last-child {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from > div:last-child,
.sheet-leave-to > div:last-child {
  transform: translateY(100%);
}
</style>