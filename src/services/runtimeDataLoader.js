const REGION_RULES = [
  { id: 'east-asia', minLat: 17, maxLat: 56, minLng: 98, maxLng: 151 },
  { id: 'oceania', minLat: -48, maxLat: -10, minLng: 110, maxLng: 180 },
  { id: 'asia', minLat: -12, maxLat: 60, minLng: 25, maxLng: 170 },
  { id: 'africa', minLat: -35, maxLat: 37, minLng: -20, maxLng: 52 },
  { id: 'europe', minLat: 35, maxLat: 72, minLng: -12, maxLng: 45 },
  { id: 'americas', minLat: -60, maxLat: 83, minLng: -170, maxLng: -35 }
]

export function classifyRegionForCoords(lat, lng) {
  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return 'other'
  for (const rule of REGION_RULES) {
    if (latNum >= rule.minLat && latNum <= rule.maxLat && lngNum >= rule.minLng && lngNum <= rule.maxLng) {
      return rule.id
    }
  }
  return 'other'
}

export function getChunkIdsForRegion(manifest, regionId, maxChunks = 3) {
  if (!manifest?.chunks || !Array.isArray(manifest.chunks)) return []
  return manifest.chunks
    .filter((chunk) => chunk.region === regionId)
    .slice(0, maxChunks)
    .map((chunk) => chunk.id)
}

export async function fetchChunkManifest() {
  const response = await fetch('/data/chunks/manifest.json')
  if (!response.ok) throw new Error(`Failed to load chunk manifest: ${response.status}`)
  return response.json()
}

export async function fetchSearchIndex() {
  const response = await fetch('/data/search-index.json')
  if (!response.ok) throw new Error(`Failed to load search index: ${response.status}`)
  return response.json()
}

export async function fetchChunkRecords(chunkPath) {
  const response = await fetch(chunkPath)
  if (!response.ok) throw new Error(`Failed to load chunk ${chunkPath}: ${response.status}`)
  const payload = await response.json()
  return Array.isArray(payload?.records) ? payload.records : []
}
