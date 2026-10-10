<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePlans } from '@/composables/usePlans'
import { useCities } from '@/composables/useCities'
import { useConfig } from '@/composables/useConfig'
import type { CityPlan, PlanDay } from '@/types/plan'
import PlanEditor from './PlanEditor.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'request-config'): void
}>()

const { plans, loading, error, source, syncingTaskId, syncError, loadPlans, addPlan, updatePlan, toggleTask } =
  usePlans()
const { cities, loadCities } = useCities()
const { configVersion } = useConfig()

const visible = computed(() => props.modelValue)

const editorOpen = ref(false)
const editorCityName = ref('')
/** 正在编辑的行程（非空表示编辑模式，否则为新建） */
const editingPlan = ref<CityPlan | null>(null)
const savingPlan = ref(false)
const planError = ref<string | null>(null)

// 已状态为「计划中」、且尚未建立行程的足迹，供用户一键安排行程
const plannedFootprints = computed(() =>
  cities.value.filter((c) => !c.properties.visited && !hasPlan(c.properties.name)),
)

function hasPlan(name: string): boolean {
  const n = name.trim().toLowerCase()
  return plans.value.some((p) => p.city_name.trim().toLowerCase() === n)
}

// 配置保存/清除后自动重新加载行程与足迹数据（与新数据源保持一致）
watch(configVersion, async () => {
  await Promise.all([loadPlans(), loadCities()])
})

onMounted(async () => {
  if (plans.value.length === 0) await loadPlans()
})

// 打开行程计划时确保足迹数据已加载，以便展示「计划中的足迹」
watch(visible, async (open) => {
  if (open && cities.value.length === 0) await loadCities()
})

function openEditor() {
  startPlanFor('')
}

function startPlanFor(cityName: string) {
  startEdit(null, cityName)
}

function startEdit(plan: CityPlan | null, cityName = '') {
  planError.value = null
  editingPlan.value = plan
  editorCityName.value = plan?.city_name ?? cityName
  editorOpen.value = true
}

async function onSavePlan(form: {
  city_name: string
  title: string
  days: { date: string; title: string; tasks: string[] }[]
}) {
  savingPlan.value = true
  planError.value = null
  try {
    if (editingPlan.value) {
      await updatePlan(editingPlan.value.city_id, form)
    } else {
      await addPlan(form)
    }
    editingPlan.value = null
    editorOpen.value = false
  } catch (e: any) {
    planError.value = e?.message ?? '保存失败，请重试。'
  } finally {
    savingPlan.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

function progressOf(plan: CityPlan): { done: number; total: number; pct: number } {
  const tasks = plan.days.flatMap((d) => d.tasks)
  const total = tasks.length
  const done = tasks.filter((t) => t.done).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

function dayDoneCount(day: PlanDay): number {
  return day.tasks.filter((t) => t.done).length
}

function handleToggle(plan: CityPlan, day: PlanDay, taskId: string) {
  toggleTask(plan.city_id, day.id, taskId)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col"
      >
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
              地图
            </button>
            <h1 class="text-base font-semibold text-slate-900 dark:text-slate-100">行程计划</h1>
            <div class="flex items-center gap-2">
              <button
                class="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center active:bg-brand-700"
                title="新建行程"
                @click="openEditor"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <div
                class="text-xs px-2 py-0.5 rounded-full"
                :class="
                  source === 'github'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                "
              >
                {{ source === 'github' ? '已同步' : '本地' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Sync error banner -->
        <div
          v-if="syncError"
          class="shrink-0 mx-4 mt-3 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs px-3 py-2"
        >
          {{ syncError }}
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto no-scrollbar px-4 py-4">
          <div v-if="loading" class="text-center text-sm text-slate-400 py-10">
            加载行程中…
          </div>
          <div v-else-if="error" class="text-center text-sm text-rose-500 py-10">
            {{ error }}
          </div>

          <template v-else>
            <!-- 计划中的足迹：一键安排行程 -->
            <section v-if="plannedFootprints.length" class="mb-6">
              <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                计划中的足迹 · 待安排行程
              </h2>
              <div class="space-y-2">
                <div
                  v-for="c in plannedFootprints"
                  :key="c.properties.id"
                  class="rounded-2xl bg-white dark:bg-slate-900 p-3.5 shadow-sm border border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{{ c.properties.name }}</span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">计划中</span>
                    </div>
                    <p class="text-xs text-slate-400 mt-0.5 truncate">{{ c.properties.country }}</p>
                  </div>
                  <button
                    class="shrink-0 text-xs font-semibold text-brand-600 bg-brand-50 dark:bg-brand-900/30 rounded-full px-3 py-1.5 active:opacity-60"
                    @click="startPlanFor(c.properties.name)"
                  >
                    安排行程
                  </button>
                </div>
              </div>
            </section>

            <div v-if="plans.length === 0 && plannedFootprints.length === 0" class="text-center py-10">
              <p class="text-sm text-slate-400 mb-4">暂无行程计划。</p>
              <button
                class="inline-flex items-center gap-1.5 rounded-full bg-brand-600 text-white pl-4 pr-5 py-2.5 text-sm font-semibold active:bg-brand-700"
                @click="openEditor"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                新建第一个行程
              </button>
            </div>

            <div v-else class="space-y-6">
            <section v-for="plan in plans" :key="plan.city_id" class="space-y-3">
              <!-- Plan header -->
              <div class="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-100 dark:border-slate-800">
                <div class="flex items-center justify-between mb-2">
                  <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                    {{ plan.city_name }}
                  </h2>
                  <div class="flex items-center gap-2">
                    <button
                      class="text-xs font-medium text-brand-600 active:opacity-60 flex items-center gap-1"
                      @click="startEdit(plan)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      编辑
                    </button>
                    <span class="text-xs text-slate-400">
                      {{ progressOf(plan).done }}/{{ progressOf(plan).total }}
                    </span>
                  </div>
                </div>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">{{ plan.title }}</p>
                <!-- Progress bar -->
                <div class="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    :style="{ width: `${progressOf(plan).pct}%` }"
                  ></div>
                </div>
              </div>

              <!-- Timeline -->
              <div class="relative pl-6">
                <!-- Vertical line -->
                <div class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700"></div>

                <div v-for="day in plan.days" :key="day.id" class="relative mb-5">
                  <!-- Day node -->
                  <div class="absolute -left-6 top-1 flex flex-col items-center">
                    <div
                      class="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                      :class="
                        dayDoneCount(day) === day.tasks.length && day.tasks.length > 0
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-brand-500 bg-white dark:bg-slate-900 text-brand-500'
                      "
                    >
                      <span v-if="dayDoneCount(day) === day.tasks.length && day.tasks.length > 0">✓</span>
                      <span v-else>{{ plan.days.indexOf(day) + 1 }}</span>
                    </div>
                  </div>

                  <!-- Day card -->
                  <div class="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div class="px-4 py-3 border-b border-slate-50 dark:border-slate-800/70">
                      <p class="text-xs text-slate-400">{{ day.date }}</p>
                      <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ day.title }}</h3>
                    </div>

                    <ul class="divide-y divide-slate-50 dark:divide-slate-800/70">
                      <li
                        v-for="task in day.tasks"
                        :key="task.id"
                        class="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/50"
                      >
                        <!-- Custom checkbox -->
                        <button
                          class="relative shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                          :class="
                            task.done
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          "
                          :disabled="syncingTaskId === task.id"
                          @click="handleToggle(plan, day, task.id)"
                        >
                          <svg
                            v-if="task.done"
                            class="w-3.5 h-3.5 text-white check-pop"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            viewBox="0 0 24 24"
                          >
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span
                            v-if="syncingTaskId === task.id"
                            class="absolute inset-0 rounded-full border-2 border-slate-300 border-t-brand-500 animate-spin"
                          ></span>
                        </button>

                        <span
                          class="flex-1 text-sm leading-snug transition-colors"
                          :class="
                            task.done
                              ? 'text-slate-400 line-through'
                              : 'text-slate-700 dark:text-slate-200'
                          "
                        >
                          {{ task.name }}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <PlanEditor
    v-model="editorOpen"
    :source="source"
    :saving="savingPlan"
    :error="planError"
    :initial-city-name="editorCityName"
    :initial-plan="editingPlan"
    @save="onSavePlan"
    @request-config="emit('request-config')"
  />
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

/* Optimistic checkmark pop animation */
.check-pop {
  animation: pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
