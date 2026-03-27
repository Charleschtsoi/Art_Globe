/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeArtworks } from '../src/services/normalizeArtwork.js'
import { artworks, easternArtData } from '../src/artData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const externalPath = path.resolve(projectRoot, 'src/data/externalArtData.json')
const outDir = path.resolve(projectRoot, 'public/data/chunks')
const searchIndexPath = path.resolve(projectRoot, 'public/data/search-index.json')
const manifestPath = path.resolve(outDir, 'manifest.json')
const chunkSize = Number(process.env.ART_DATA_CHUNK_SIZE ?? 300)

const REGION_RULES = [
  { id: 'east-asia', label: 'East Asia', minLat: 17, maxLat: 56, minLng: 98, maxLng: 151 },
  { id: 'oceania', label: 'Oceania', minLat: -48, maxLat: -10, minLng: 110, maxLng: 180 },
  { id: 'asia', label: 'Asia', minLat: -12, maxLat: 60, minLng: 25, maxLng: 170 },
  { id: 'africa', label: 'Africa', minLat: -35, maxLat: 37, minLng: -20, maxLng: 52 },
  { id: 'europe', label: 'Europe', minLat: 35, maxLat: 72, minLng: -12, maxLng: 45 },
  { id: 'americas', label: 'Americas', minLat: -60, maxLat: 83, minLng: -170, maxLng: -35 }
]

function classifyRegion(lat, lng) {
  for (const rule of REGION_RULES) {
    if (lat >= rule.minLat && lat <= rule.maxLat && lng >= rule.minLng && lng <= rule.maxLng) {
      return rule.id
    }
  }
  return 'other'
}

function summarizeChunk(chunkId, region, records, relPath) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  const cities = new Set()
  for (const row of records) {
    minLat = Math.min(minLat, row.lat)
    maxLat = Math.max(maxLat, row.lat)
    minLng = Math.min(minLng, row.lng)
    maxLng = Math.max(maxLng, row.lng)
    const city = String(row.current_location?.city ?? row.displayCity ?? '')
    if (city) cities.add(city)
  }
  return {
    id: chunkId,
    region,
    path: relPath,
    count: records.length,
    minLat,
    maxLat,
    minLng,
    maxLng,
    sampleCities: [...cities].slice(0, 6)
  }
}

async function main() {
  const externalRaw = await fs.readFile(externalPath, 'utf8')
  const externalArtData = JSON.parse(externalRaw)
  const normalized = normalizeArtworks([...(artworks ?? []), ...(easternArtData ?? []), ...(externalArtData ?? [])])

  const byRegion = new Map()
  for (const item of normalized) {
    const region = classifyRegion(Number(item.lat), Number(item.lng))
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region).push(item)
  }

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const chunks = []
  const searchRecords = []

  for (const [region, regionItems] of byRegion.entries()) {
    const sorted = [...regionItems].sort((a, b) =>
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
    )
    let part = 0
    for (let i = 0; i < sorted.length; i += chunkSize) {
      const records = sorted.slice(i, i + chunkSize)
      const chunkId = `${region}-${String(part).padStart(4, '0')}`
      const filename = `${chunkId}.json`
      const absPath = path.resolve(outDir, filename)
      const relPath = `/data/chunks/${filename}`
      await fs.writeFile(absPath, JSON.stringify({ chunkId, region, records }, null, 2), 'utf8')
      chunks.push(summarizeChunk(chunkId, region, records, relPath))
      for (const rec of records) {
        searchRecords.push({
          id: String(rec.id ?? rec.artwork_id ?? ''),
          chunkId,
          title: rec.title ?? '',
          artist: rec.artist ?? '',
          museum: rec.museumName ?? rec.current_location?.museum ?? '',
          city: rec.current_location?.city ?? '',
          country: rec.current_location?.country ?? '',
          lat: Number(rec.lat),
          lng: Number(rec.lng),
          imageUrl: rec.imageUrl ?? '',
          canonicalImageUrl: rec.canonicalImageUrl ?? rec.imageUrl ?? ''
        })
      }
      part += 1
    }
  }

  chunks.sort((a, b) => a.id.localeCompare(b.id))
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    chunkSize,
    totalRecords: normalized.length,
    totalChunks: chunks.length,
    chunks
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  await fs.mkdir(path.dirname(searchIndexPath), { recursive: true })
  await fs.writeFile(
    searchIndexPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: manifest.generatedAt,
        totalRecords: searchRecords.length,
        records: searchRecords
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Runtime data built: ${manifest.totalRecords} records into ${manifest.totalChunks} chunks`)
  console.log(`Manifest: ${path.relative(projectRoot, manifestPath)}`)
  console.log(`Search index: ${path.relative(projectRoot, searchIndexPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
