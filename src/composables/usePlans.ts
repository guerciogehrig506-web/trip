import { ref } from 'vue'
import { githubService } from './githubService'
import { useConfig } from './useConfig'
import type { CityPlan, PlansData } from '@/types/plan'

const GITHUB_PATH = 'data/plans.json'
const LOCAL_FALLBACK = `${import.meta.env.BASE_URL}sample-plans.json`

const plans = ref<CityPlan[]>([])
const sha = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)
const source = ref<'github' | 'local'>('local')

/** Tracks the task id currently being synced (for UI spinners if needed). */
const syncingTaskId = ref<string | null>(null)
const syncError = ref<string | null>(null)

async function loadPlans(forceLocal = false): Promise<void> {
  loading.value = true
  error.value = null
  const { hasConfig } = useConfig()

  try {
    if (hasConfig.value && !forceLocal) {
      const file = await githubService.fetchFile(GITHUB_PATH)
      const json = JSON.parse(file.content) as PlansData
      plans.value = json.plans ?? []
      sha.value = file.sha
      source.value = 'github'
    } else {
      const res = await fetch(LOCAL_FALLBACK)
      const json = (await res.json()) as PlansData
      plans.value = json.plans ?? []
      sha.value = ''
      source.value = 'local'
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载行程数据失败'
    plans.value = []
    if (source.value === 'github' || forceLocal === false) {
      try {
        const res = await fetch(LOCAL_FALLBACK)
        const json = (await res.json()) as PlansData
        plans.value = json.plans ?? []
        source.value = 'local'
        error.value = null
      } catch {
        /* keep error */
      }
    }
  } finally {
    loading.value = false
  }
}

/**
 * Optimistically toggle a task's done state, then sync the full plans.json
 * back to GitHub in the background.
 *
 * Steps:
 *  1. Immediately flip `done` locally (optimistic UI).
 *  2. Build the updated JSON and PUT it to GitHub.
 *  3. On failure, revert the local state and surface an error.
 *
 * Commit message: `Iterate: {Complete|Reopen} task {task_name} in {city_id}`
 * (version tag is appended by githubService).
 */
async function toggleTask(
  cityId: string,
  dayId: string,
  taskId: string,
): Promise<void> {
  const plan = plans.value.find((p) => p.city_id === cityId)
  const day = plan?.days.find((d) => d.id === dayId)
  const task = day?.tasks.find((t) => t.id === taskId)
  if (!plan || !day || !task) return

  const prevDone = task.done
  const taskName = task.name

  // 1. Optimistic update
  task.done = !prevDone

  // 2. Background sync
  if (source.value !== 'github' || !sha.value) {
    // Local-only mode: nothing to sync.
    syncError.value = '当前为本地示例数据，无法同步到 GitHub。'
    return
  }

  syncingTaskId.value = taskId
  syncError.value = null
  try {
    const payload: PlansData = { plans: plans.value }
    const jsonStr = JSON.stringify(payload, null, 2)
    const action = task.done ? 'Complete' : 'Reopen'
    await githubService.updateFile(
      GITHUB_PATH,
      jsonStr,
      sha.value,
      `Iterate: ${action} task ${taskName} in ${cityId}`,
    )
    // sha is stale after update; reload to get fresh sha for next edit.
    await loadPlans()
  } catch (e: any) {
    // 3. Revert on failure
    task.done = prevDone
    syncError.value = e?.message ?? '同步失败，已回退。'
  } finally {
    syncingTaskId.value = null
  }
}

export function usePlans() {
  return {
    plans,
    loading,
    error,
    source,
    syncingTaskId,
    syncError,
    loadPlans,
    toggleTask,
  }
}
