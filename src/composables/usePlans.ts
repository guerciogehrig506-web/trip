import { ref } from 'vue'
import { githubService } from './githubService'
import { useConfig } from './useConfig'
import type { CityPlan, PlanDay, PlansData } from '@/types/plan'

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
    // 仓库里还没有 data/plans.json：视为空计划，仍切换到 GitHub 模式。
    if (hasConfig.value && !forceLocal && e?.status === 404) {
      plans.value = []
      sha.value = ''
      source.value = 'github'
      error.value = null
    } else {
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
    const res = await githubService.updateFile(
      GITHUB_PATH,
      jsonStr,
      sha.value,
      `Iterate: ${action} task ${taskName} in ${cityId}`,
    )
    // 直接用返回的最新文件 sha，避免再次拉取引发的竞态：
    // 紧接着的下一次操作（例如误触后马上改回）不会命中过期 sha。
    sha.value = res.contentSha
  } catch (e: any) {
    // 3. Revert on failure
    task.done = prevDone
    if (e?.status === 409) {
      // sha 过期（GitHub 返回 409 冲突）：刷新最新数据以同步 sha，供下一次重试。
      syncError.value = '数据已更新，请重试。'
      await loadPlans()
    } else {
      syncError.value = e?.message ?? '同步失败，已回退。'
    }
  } finally {
    syncingTaskId.value = null
  }
}

/** 由城市名生成 ASCII 安全的 id（用于计划 city_id） */
function toId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `plan-${Date.now().toString(36)}`
}

/**
 * 新建行程计划。乐观地推入本地列表，然后把完整 plans.json 写回 GitHub。
 * 失败时移除本地条目并抛出错误供 UI 展示。
 *
 * Commit message: `Add: plan {title} for {city_name}`（版本标签自动附加）。
 */
async function addPlan(input: {
  city_name: string
  title: string
  days: { date: string; title: string; tasks: string[] }[]
}): Promise<CityPlan> {
  const cityName = input.city_name.trim()
  const title = input.title.trim()
  if (!cityName) throw new Error('请输入城市名')
  if (!title) throw new Error('请输入行程标题')

  if (source.value !== 'github') {
    throw new Error('未连接 GitHub，无法保存行程。请先在设置中配置仓库。')
  }

  let cityId = toId(cityName)
  if (plans.value.some((p) => p.city_id === cityId)) {
    cityId = `${cityId}-${Date.now().toString(36)}`
  }

  const stamp = Date.now().toString(36)
  const days: PlanDay[] = input.days
    .map((d, di) => ({
      id: `${cityId}-d${di + 1}-${stamp}`,
      date: d.date.trim(),
      title: d.title.trim() || `Day ${di + 1}`,
      tasks: d.tasks
        .filter((t) => t.trim())
        .map((t, ti) => ({
          id: `${cityId}-d${di + 1}t${ti + 1}-${stamp}`,
          name: t.trim(),
          done: false,
        })),
    }))
    .filter((d) => d.date || d.tasks.length > 0)

  const plan: CityPlan = { city_id: cityId, city_name: cityName, title, days }

  // 乐观更新
  plans.value.push(plan)

  try {
    const payload: PlansData = { plans: plans.value }
    const jsonStr = JSON.stringify(payload, null, 2)
    const res = await githubService.updateFile(
      GITHUB_PATH,
      jsonStr,
      sha.value,
      `Add: plan ${title} for ${cityName}`,
    )
    sha.value = res.contentSha
    return plan
  } catch (e) {
    const idx = plans.value.findIndex((p) => p.city_id === cityId)
    if (idx >= 0) plans.value.splice(idx, 1)
    throw e
  }
}

/**
 * 更新已有行程计划。编辑表单只回传任务文案（无 done 状态），
 * 因此这里按任务名匹配旧计划，尽量保留已完成/未完成勾选状态。
 * 乐观替换本地条目，失败时回滚并抛错。
 *
 * Commit message: `Update: plan {title} for {city_name}`（版本标签自动附加）。
 */
async function updatePlan(
  cityId: string,
  input: {
    city_name: string
    title: string
    days: { date: string; title: string; tasks: string[] }[]
  },
): Promise<CityPlan> {
  const idx = plans.value.findIndex((p) => p.city_id === cityId)
  if (idx < 0) throw new Error('行程不存在')

  const old = plans.value[idx]
  const cityName = input.city_name.trim()
  const title = input.title.trim()
  if (!cityName) throw new Error('请输入城市名')
  if (!title) throw new Error('请输入行程标题')
  if (source.value !== 'github' || !sha.value) {
    throw new Error('未连接 GitHub，无法保存行程。请先在设置中配置仓库。')
  }

  const stamp = Date.now().toString(36)
  const days: PlanDay[] = input.days
    .map((d, di) => {
      const oldDay = old.days[di]
      // 按任务名保留勾选状态：编辑通常只是增删改文字，同名任务延续原状态
      const doneByName = new Map<string, boolean>()
      oldDay?.tasks.forEach((t) => doneByName.set(t.name, t.done))
      return {
        id: oldDay?.id ?? `${cityId}-d${di + 1}-${stamp}`,
        date: d.date.trim(),
        title: d.title.trim() || `Day ${di + 1}`,
        tasks: d.tasks
          .filter((t) => t.trim())
          .map((t, ti) => {
            const oldTask = oldDay?.tasks[ti]
            const name = t.trim()
            const done = doneByName.get(name) ?? (oldTask?.name === name ? oldTask.done : false)
            return {
              id: oldTask?.id ?? `${cityId}-d${di + 1}t${ti + 1}-${stamp}`,
              name,
              done,
            }
          }),
      }
    })
    .filter((d) => d.date || d.tasks.length > 0)

  const updated: CityPlan = { city_id: cityId, city_name: cityName, title, days }

  plans.value[idx] = updated

  try {
    const payload: PlansData = { plans: plans.value }
    const jsonStr = JSON.stringify(payload, null, 2)
    const res = await githubService.updateFile(
      GITHUB_PATH,
      jsonStr,
      sha.value,
      `Update: plan ${title} for ${cityName}`,
    )
    sha.value = res.contentSha
    return updated
  } catch (e) {
    plans.value[idx] = old
    throw e
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
    addPlan,
    updatePlan,
    toggleTask,
  }
}
