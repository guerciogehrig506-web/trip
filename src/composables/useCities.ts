import { ref } from 'vue'
import { githubService } from './githubService'
import { useConfig } from './useConfig'
import type { CitiesData, CitiesGeoJSON, CityFeature } from '@/types/city'

const GITHUB_PATH = 'data/cities.geojson'
const LOCAL_FALLBACK = '/sample-cities.geojson'

const cities = ref<CityFeature[]>([])
const sha = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)
const source = ref<'github' | 'local'>('local')

/**
 * Load cities. If GitHub is configured, fetch data/cities.geojson from the
 * repository. Otherwise fall back to the bundled sample so the map is usable
 * during local development.
 */
async function loadCities(forceLocal = false): Promise<CitiesData> {
  loading.value = true
  error.value = null
  const { hasConfig } = useConfig()

  try {
    if (hasConfig.value && !forceLocal) {
      const file = await githubService.fetchFile(GITHUB_PATH)
      const json = JSON.parse(file.content) as CitiesGeoJSON
      cities.value = json.features ?? []
      sha.value = file.sha
      source.value = 'github'
    } else {
      const res = await fetch(LOCAL_FALLBACK)
      const json = (await res.json()) as CitiesGeoJSON
      cities.value = json.features ?? []
      sha.value = ''
      source.value = 'local'
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载城市数据失败'
    // On GitHub failure, try local fallback once.
    if (source.value === 'github' || forceLocal === false) {
      try {
        const res = await fetch(LOCAL_FALLBACK)
        const json = (await res.json()) as CitiesGeoJSON
        cities.value = json.features ?? []
        sha.value = ''
        source.value = 'local'
        error.value = null
      } catch {
        /* keep original error */
      }
    }
  } finally {
    loading.value = false
  }

  return { features: cities.value, sha: sha.value, source: source.value }
}

/** 由城市名生成 ASCII 安全的 id（用于文件路径 logs/{id}.md） */
function toId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `city-${Date.now().toString(36)}`
}

/**
 * Add a new city footprint. Optimistically pushes it into the local list,
 * then writes the full cities.geojson back to GitHub. On failure the local
 * entry is removed and the error rethrown for the UI to surface.
 *
 * Commit message: `Add: footprint {name} in {country}` (version tag auto).
 */
async function addCity(input: {
  name: string
  country: string
  coord: [number, number]
  visited: boolean
}): Promise<CityFeature> {
  const name = input.name.trim()
  const country = input.country.trim()
  if (!name) throw new Error('请输入城市名')
  if (!country) throw new Error('请输入国家/地区')

  if (source.value !== 'github' || !sha.value) {
    throw new Error('未连接 GitHub，无法保存足迹。请先在设置中配置仓库。')
  }

  let id = toId(name)
  if (cities.value.some((c) => c.properties.id === id)) {
    id = `${id}-${Date.now().toString(36)}`
  }

  const feature: CityFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: input.coord },
    properties: {
      id,
      name,
      country,
      visited: input.visited,
      rating: 0,
      summary: '',
      log: `logs/${id}.md`,
    },
  }

  // 乐观更新：先上屏
  cities.value.push(feature)

  try {
    const payload: CitiesGeoJSON = {
      type: 'FeatureCollection',
      features: cities.value,
    }
    const jsonStr = JSON.stringify(payload, null, 2)
    const res = await githubService.updateFile(
      GITHUB_PATH,
      jsonStr,
      sha.value,
      `Add: footprint ${name} in ${country}`,
    )
    sha.value = res.contentSha
    return feature
  } catch (e) {
    // 失败回滚：移除刚才乐观加入的条目
    const idx = cities.value.findIndex((c) => c.properties.id === id)
    if (idx >= 0) cities.value.splice(idx, 1)
    throw e
  }
}

export function useCities() {
  return {
    cities,
    sha,
    loading,
    error,
    source,
    loadCities,
    addCity,
  }
}
