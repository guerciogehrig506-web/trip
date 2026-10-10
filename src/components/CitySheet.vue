<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { CityFeature } from '@/types/city'
import { useCityLog } from '@/composables/useCityLog'
import { useCities } from '@/composables/useCities'
import MarkdownViewer from './MarkdownViewer.vue'
import LogEditor from './LogEditor.vue'

const props = defineProps<{
  modelValue: boolean
  city: CityFeature | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'deleted'): void
}>()

const { content: logContent, loading: logLoading, error: logError, loadLog } =
  useCityLog()
const { source, removeCity } = useCities()

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

const sheetRef = ref<HTMLElement | null>(null)
const translate = ref(0)
const dragging = ref(false)
const startY = ref(0)
const sheetHeight = ref(0)

const expanded = ref(false)
const editorOpen = ref(false)

const visible = computed(() => props.modelValue && !!props.city)

const cityName = computed(() => props.city?.properties.name ?? '')
const country = computed(() => props.city?.properties.country ?? '')
const visited = computed(() => props.city?.properties.visited ?? false)
const rating = computed(() => props.city?.properties.rating ?? 0)
const summary = computed(() => props.city?.properties.summary ?? '')
const notes = computed(() => props.city?.properties.notes ?? '')
const logPath = computed(() => props.city?.properties.log ?? '')
const cityId = computed(() => props.city?.properties.id ?? '')
const coords = computed(() => {
  if (!props.city) return ''
  const [lng, lat] = props.city.geometry.coordinates
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
})

const fullStars = computed(() => Math.round(rating.value))

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      expanded.value = false
      confirmingDelete.value = false
      deleteError.value = null
      nextTick(() => {
        if (sheetRef.value) sheetHeight.value = sheetRef.value.offsetHeight
        translate.value = 0
      })
    } else {
      translate.value = 0
      confirmingDelete.value = false
      deleteError.value = null
    }
  },
)

// Load the log whenever the sheet is expanded or the city changes.
watch([expanded, () => props.city], async ([isExpanded]) => {
  if (isExpanded && logPath.value) {
    await loadLog(logPath.value)
  }
})

function close() {
  emit('update:modelValue', false)
}

function expand() {
  expanded.value = true
}

function collapse() {
  expanded.value = false
}

function openEditor() {
  editorOpen.value = true
}

function onAppended() {
  // logContent is already updated in useCityLog; MarkdownViewer will re-render.
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

async function doDelete() {
  if (!cityId.value || deleting.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await removeCity(cityId.value)
    emit('deleted')
  } catch (e: any) {
    deleteError.value = e?.message ?? '删除失败，请重试。'
  } finally {
    deleting.value = false
  }
}

// --- Gesture handling on the drag handle ---
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  startY.value = t.clientY
  dragging.value = true
}

function onTouchMove(e: TouchEvent) {
  if (!dragging.value) return
  const t = e.touches[0]
  const delta = t.clientY - startY.value
  if (expanded.value) {
    // In expanded mode, only downward drag (collapse) is tracked on the handle.
    if (delta > 0) translate.value = delta
  } else {
    // In collapsed mode, allow both up (expand) and down (close).
    translate.value = delta
  }
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  const threshold = 80
  const d = translate.value

  if (expanded.value) {
    if (d > threshold) {
      collapse()
    }
  } else {
    if (d < -threshold) {
      expand()
    } else if (d > threshold) {
      close()
    }
  }
  translate.value = 0
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-end justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="onMaskClick"
        ></div>

        <!-- Sheet -->
        <div
          ref="sheetRef"
          class="relative w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col"
          :class="expanded ? 'h-full rounded-none' : 'rounded-t-3xl max-h-[85vh]'"
          :style="{
            transform: `translateY(${translate}px)`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }"
        >
          <!-- Drag handle -->
          <div
            class="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none shrink-0"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
          >
            <div class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
          </div>

          <!-- ============ COLLAPSED: city summary ============ -->
          <div
            v-if="!expanded"
            class="px-5 pb-5 pt-1 overflow-y-auto no-scrollbar flex-1"
          >
            <div class="flex items-start justify-between mb-3">
              <div>
                <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {{ cityName }}
                </h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">{{ country }}</p>
              </div>
              <button
                class="text-slate-400 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                ×
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2 mb-4">
              <span
                class="text-xs px-2.5 py-1 rounded-full font-medium"
                :class="
                  visited
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                "
              >
                {{ visited ? '已到访' : '计划中' }}
              </span>

              <div v-if="rating > 0" class="flex items-center gap-0.5">
                <span
                  v-for="i in 5"
                  :key="i"
                  class="text-sm"
                  :class="i <= fullStars ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'"
                >
                  ★
                </span>
              </div>

              <span class="text-xs text-slate-400 font-mono">{{ coords }}</span>
            </div>

            <div class="mb-4">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                城市印象
              </h3>
              <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {{ summary }}
              </p>
            </div>

            <div v-if="notes">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                备注
              </h3>
              <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
                {{ notes }}
              </p>
            </div>

            <div class="flex gap-2 mt-5">
              <button
                class="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                关闭
              </button>
              <button
                class="flex-[1.5] rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
                @click="expand"
              >
                查看日志
              </button>
            </div>

            <p class="text-center text-xs text-slate-400 mt-3">
              ↑ 上滑查看完整旅行日志
            </p>

            <!-- 删除足迹（仅 GitHub 数据源） -->
            <div v-if="source === 'github'" class="mt-3">
              <div v-if="!confirmingDelete" class="flex justify-center">
                <button
                  class="text-xs text-slate-400 active:text-rose-500 px-2 py-1"
                  @click="confirmingDelete = true"
                >
                  删除足迹
                </button>
              </div>
              <div v-else class="flex items-center justify-center gap-3">
                <span class="text-xs text-slate-400">{{ deleting ? '删除中…' : '确认删除该足迹？' }}</span>
                <button
                  class="text-xs font-semibold text-rose-500 disabled:opacity-50"
                  :disabled="deleting"
                  @click="doDelete"
                >
                  删除
                </button>
                <button
                  class="text-xs text-slate-400"
                  :disabled="deleting"
                  @click="confirmingDelete = false"
                >
                  取消
                </button>
              </div>
              <p v-if="deleteError" class="mt-1 text-center text-xs text-rose-500">{{ deleteError }}</p>
            </div>
          </div>

          <!-- ============ EXPANDED: fullscreen log ============ -->
          <template v-else>
            <!-- Sticky header -->
            <div class="shrink-0 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between bg-white dark:bg-slate-900">
              <button
                class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 active:opacity-60"
                @click="collapse"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                返回
              </button>
              <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[50%]">
                {{ cityName }} · 日志
              </h2>
              <button
                class="flex items-center gap-1 text-sm font-medium text-brand-600 active:opacity-60"
                @click="openEditor"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                添加记录
              </button>
            </div>

            <!-- Log content -->
            <div class="flex-1 overflow-y-auto no-scrollbar px-5 py-4">
              <div
                v-if="logLoading"
                class="text-center text-sm text-slate-400 py-10"
              >
                加载日志中…
              </div>
              <div
                v-else-if="logError"
                class="text-center text-sm text-rose-500 py-10"
              >
                {{ logError }}
              </div>
              <div v-else-if="!logContent" class="text-center text-sm text-slate-400 py-10">
                暂无日志，点击右上角「添加记录」开始记录吧。
              </div>
              <MarkdownViewer v-else :content="logContent" />
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <LogEditor
      v-model="editorOpen"
      :city-id="cityId"
      :log-path="logPath"
      @appended="onAppended"
    />
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
