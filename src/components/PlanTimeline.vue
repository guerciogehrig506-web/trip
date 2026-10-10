<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { usePlans } from '@/composables/usePlans'
import type { CityPlan, PlanDay } from '@/types/plan'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { plans, loading, error, source, syncingTaskId, syncError, loadPlans, toggleTask } =
  usePlans()

const visible = computed(() => props.modelValue)

onMounted(async () => {
  if (plans.value.length === 0) await loadPlans()
})

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
          <div v-else-if="plans.length === 0" class="text-center text-sm text-slate-400 py-10">
            暂无行程计划。
          </div>

          <div v-else class="space-y-6">
            <section v-for="plan in plans" :key="plan.city_id" class="space-y-3">
              <!-- Plan header -->
              <div class="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-100 dark:border-slate-800">
                <div class="flex items-center justify-between mb-2">
                  <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                    {{ plan.city_name }}
                  </h2>
                  <span class="text-xs text-slate-400">
                    {{ progressOf(plan).done }}/{{ progressOf(plan).total }}
                  </span>
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
