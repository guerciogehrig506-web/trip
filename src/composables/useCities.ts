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

export function useCities() {
  return {
    cities,
    sha,
    loading,
    error,
    source,
    loadCities,
  }
}
