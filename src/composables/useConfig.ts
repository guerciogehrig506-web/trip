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
}

function clearConfig() {
  pat.value = ''
  owner.value = ''
  repo.value = ''
  branch.value = 'main'
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k))
}

export function useConfig() {
  return {
    pat,
    owner,
    repo,
    branch,
    hasConfig,
    saveConfig,
    clearConfig,
  }
}
