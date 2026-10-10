export interface CityProperties {
  id: string
  name: string
  country: string
  visited: boolean
  rating: number
  summary: string
  notes?: string
  cover?: string
  /** Path to the city's markdown travel log, e.g. "logs/tokyo.md" */
  log?: string
}

export interface CityFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: CityProperties
}

export interface CitiesGeoJSON {
  type: 'FeatureCollection'
  features: CityFeature[]
}

export interface CitiesData {
  features: CityFeature[]
  sha: string
  source: 'github' | 'local'
}
