<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { CityFeature } from '@/types/city'

const props = defineProps<{
  modelValue: boolean
  city: CityFeature | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const sheetRef = ref<HTMLElement | null>(null)
const translate = ref(0) // current translateY in px during drag
const dragging = ref(false)
const startY = ref(0)
const sheetHeight = ref(0)

const visible = computed(() => props.modelValue && !!props.city)

const cityName = computed(() => props.city?.properties.name ?? '')
const country = computed(() => props.city?.properties.country ?? '')
const visited = computed(() => props.city?.properties.visited ?? false)
const rating = computed(() => props.city?.properties.rating ?? 0)
const summary = computed(() => props.city?.properties.summary ?? '')
const notes = computed(() => props.city?.properties.notes ?? '')
const coords = computed(() => {
  if (!props.city) return ''
  const [lng, lat] = props.city.geometry.coordinates
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
})

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      nextTick(() => {
        if (sheetRef.value) {
          sheetHeight.value = sheetRef.value.offsetHeight
        }
        translate.value = 0
      })
    } else {
      translate.value = 0
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

// --- Swipe down to close ---
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  startY.value = t.clientY
  dragging.value = true
}

function onTouchMove(e: TouchEvent) {
  if (!dragging.value) return
  const t = e.touches[0]
  const delta = t.clientY - startY.value
  // Only allow downward drag (positive delta). Resist upward movement slightly.
  if (delta > 0) {
    translate.value = delta
  } else {
    translate.value = delta * 0.3
  }
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  const threshold = sheetHeight.value * 0.25
  if (translate.value > threshold) {
    close()
  } else {
    translate.value = 0
  }
}

// Star display helper
const fullStars = computed(() => Math.round(rating.value))
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
          class="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden"
          :style="{
            transform: `translateY(${translate}px)`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }"
        >
          <!-- Drag handle area (touch target for swipe) -->
          <div
            class="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
          >
            <div class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
          </div>

          <div class="px-5 pb-5 pt-1 overflow-y-auto no-scrollbar max-h-[calc(85vh-2.5rem)]">
            <!-- Header: name + country + close -->
            <div class="flex items-start justify-between mb-3">
              <div>
                <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {{ cityName }}
                </h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">{{ country }}</p>
              </div>
              <button
                class="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                ×
              </button>
            </div>

            <!-- Status row: visited badge + rating + coords -->
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

            <!-- Summary -->
            <div class="mb-4">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                城市印象
              </h3>
              <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {{ summary }}
              </p>
            </div>

            <!-- Notes -->
            <div v-if="notes">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                备注
              </h3>
              <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
                {{ notes }}
              </p>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-2 mt-5">
              <button
                class="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                关闭
              </button>
              <button
                class="flex-[1.5] rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
                @click="close"
              >
                查看详情
              </button>
            </div>
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
