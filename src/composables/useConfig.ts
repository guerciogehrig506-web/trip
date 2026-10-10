import { ref, computed } from 'vue'

const STORAGE_KEYS = {
  pat: 'travel_gh_pat',
  owner: 'travel_gh_owner',
  repo: 'travel_gh_repo',
  branch: 'travel_gh_branch',
} as const

export interface GithubConfig {
  pat: string
  owner: string
  repo: string
  branch: string
}

const pat = ref<string>(localStorage.getItem(STORAGE_KEYS.pat) ?? '')
const owner = ref<string>(localStorage.getItem(STORAGE_KEYS.owner) ?? '')
const repo = ref<string>(localStorage.getItem(STORAGE_KEYS.repo) ?? '')
const branch = ref<string>(localStorage.getItem(STORAGE_KEYS.branch) ?? 'main')
/** 每次保存/清除配置时 +1，供组件监听以重新加载数据 */
const configVersion = ref(0)

const hasConfig = computed(
  () => !!pat.value && !!owner.value && !!repo.value,
)

function saveConfig(next: Partial<GithubConfig>) {
  if (next.pat !== undefined) {
    pat.value = next.pat
    localStorage.setItem(STORAGE_KEYS.pat, next.pat)
  }
  if (next.owner !== undefined) {
    owner.value = next.owner
    localStorage.setItem(STORAGE_KEYS.owner, next.owner)
  }
  if (next.repo !== undefined) {
    repo.value = next.repo
    localStorage.setItem(STORAGE_KEYS.repo, next.repo)
  }
  if (next.branch !== undefined) {
    branch.value = next.branch
    localStorage.setItem(STORAGE_KEYS.branch, next.branch)
  }
  configVersion.value += 1
}

function clearConfig() {
  pat.value = ''
  owner.value = ''
  repo.value = ''
  branch.value = 'main'
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k))
  configVersion.value += 1
}

export function useConfig() {
  return {
    pat,
    owner,
    repo,
    branch,
    hasConfig,
    configVersion,
    saveConfig,
    clearConfig,
  }
}
