<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CityPlan } from '@/types/plan'

interface DayDraft {
  date: string
  title: string
  tasks: string[]
}

const props = defineProps<{
  modelValue: boolean
  source: 'github' | 'local'
  saving: boolean
  error?: string | null
  /** 打开表单时预填的城市名（例如从「计划中的足迹」点进来） */
  initialCityName?: string
  /** 编辑模式下传入的完整行程，用于回填表单 */
  initialPlan?: CityPlan | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', form: { city_name: string; title: string; days: DayDraft[] }): void
  (e: 'request-config'): void
}>()

const cityName = ref('')
const title = ref('')
const days = ref<DayDraft[]>([makeDay(1)])

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function makeDay(n: number): DayDraft {
  return { date: todayStr(), title: `Day ${n}`, tasks: [''] }
}

function addDay() {
  days.value.push(makeDay(days.value.length + 1))
}

function removeDay(i: number) {
  days.value.splice(i, 1)
  if (days.value.length === 0) days.value.push(makeDay(1))
}

function addTask(di: number) {
  days.value[di].tasks.push('')
}

function removeTask(di: number, ti: number) {
  days.value[di].tasks.splice(ti, 1)
}

const canSubmit = computed(
  () =>
    props.source === 'github' &&
    cityName.value.trim().length > 0 &&
    title.value.trim().length > 0,
)

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      const plan = props.initialPlan
      if (plan) {
        cityName.value = plan.city_name
        title.value = plan.title
        days.value = plan.days.map((d) => ({
          date: d.date,
          title: d.title,
          tasks: d.tasks.map((t) => t.name),
        }))
        if (days.value.length === 0) days.value = [makeDay(1)]
      } else {
        cityName.value = props.initialCityName ?? ''
        title.value = ''
        days.value = [makeDay(1)]
      }
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function submit() {
  if (!canSubmit.value) return
  emit('save', {
    city_name: cityName.value.trim(),
    title: title.value.trim(),
    days: days.value.map((d) => ({
      date: d.date,
      title: d.title.trim(),
      tasks: [...d.tasks],
    })),
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="modelValue" class="fixed inset-0 z-[60] bg-slate-50 dark:bg-slate-950 flex flex-col">
        <!-- Header -->
        <div class="shrink-0 pt-safe bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center justify-between px-4 h-14">
            <button
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 active:opacity-60"
              @click="close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
            <h1 class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ initialPlan ? '编辑行程' : '新建行程' }}</h1>
            <button
              class="text-sm font-semibold text-brand-600 disabled:opacity-40 active:opacity-60"
              :disabled="!canSubmit || saving"
              @click="submit"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-28">
          <!-- 未连接引导 -->
          <div
            v-if="source === 'local'"
            class="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
          >
            当前为本地示例数据，保存行程需先连接 GitHub 仓库。
            <button class="ml-1 underline font-medium" @click="emit('request-config')">
              去配置
            </button>
          </div>

          <p v-if="error" class="mb-3 text-sm text-rose-500">{{ error }}</p>

          <!-- 城市名 -->
          <div class="mb-3">
            <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">城市名</label>
            <input
              v-model="cityName"
              type="text"
              placeholder="例如：东京"
              class="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
            />
          </div>

          <!-- 行程标题 -->
          <div class="mb-4">
            <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">行程标题</label>
            <input
              v-model="title"
              type="text"
              placeholder="例如：东京 5 日赏樱行程"
              class="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
            />
          </div>

          <!-- 天数列表 -->
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">每日安排</h2>
            <button
              class="flex items-center gap-1 text-xs font-medium text-brand-600 active:opacity-60"
              @click="addDay"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              添加一天
            </button>
          </div>

          <div class="space-y-3">
            <div
              v-for="(day, di) in days"
              :key="di"
              class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
                  {{ di + 1 }}
                </span>
                <input
                  v-model="day.date"
                  type="date"
                  class="flex-1 min-w-0 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-brand-500"
                />
                <button
                  class="text-slate-300 dark:text-slate-600 active:text-rose-500 shrink-0"
                  title="删除这一天"
                  @click="removeDay(di)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <input
                v-model="day.title"
                type="text"
                placeholder="例如：浅草与上野"
                class="w-full rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 mb-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
              />

              <div class="space-y-1.5">
                <div
                  v-for="(task, ti) in day.tasks"
                  :key="ti"
                  class="flex items-center gap-2"
                >
                  <input
                    :value="task"
                    @input="day.tasks[ti] = ($event.target as HTMLInputElement).value"
                    type="text"
                    placeholder="待办事项"
                    class="flex-1 min-w-0 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-brand-500"
                  />
                  <button
                    class="text-slate-300 dark:text-slate-600 active:text-rose-500 shrink-0"
                    title="删除待办"
                    @click="removeTask(di, ti)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <button
                  class="flex items-center gap-1 text-xs font-medium text-slate-400 active:text-brand-600"
                  @click="addTask(di)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  添加待办
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部保存 -->
        <div class="shrink-0 px-4 pt-3 pb-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
          <button
            v-if="source === 'github'"
            class="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canSubmit || saving"
            @click="submit"
          >
            {{ saving ? '保存中…' : '保存行程' }}
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
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>