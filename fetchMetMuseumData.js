/* global process */
/**
 * Fetch public-domain artworks from The Met Collection API and merge into
 * src/data/externalArtData.json.
 *
 * Rate limit: The Met asks clients to limit request rate to 80 rps.
 * This script defaults to a conservative rate (25 rps) and is configurable.
 *
 * Run:
 *   npm run fetch:met
 *
 * Env:
 *   FETCH_MET_MAX_OBJECTS=200
 *   FETCH_MET_REQUESTS_PER_SECOND=25
 *   FETCH_MET_START_OFFSET=0
 *   FETCH_MET_ATTEMPTS=4
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const USER_AGENT = 'ArtGlobeMetFetcher/1.0 (educational project)'

const MET_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1'
const MET_OBJECTS_URL = `${MET_BASE}/objects`
const MET_OBJECT_URL = (id) => `${MET_BASE}/objects/${id}`

const MET_MUSEUM_NAME = 'Metropolitan Museum of Art'
const MET_COORDS = { lat: 40.779444444, lng: -73.963333333 }

const MAX_OBJECTS = Number(process.env.FETCH_MET_MAX_OBJECTS ?? 200)
const REQUESTS_PER_SECOND = Number(process.env.FETCH_MET_REQUESTS_PER_SECOND ?? 25)
const START_OFFSET = Number(process.env.FETCH_MET_START_OFFSET ?? 0)
const MAX_ATTEMPTS = Number(process.env.FETCH_MET_ATTEMPTS ?? 4)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function safeString(val, fallback = '') {
  const s = String(val ?? '').trim()
  return s || fallback
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (u.startsWith('/')) return true
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false
  return true
}

function normalizeMetImageUrl(url) {
  // Met URLs are already HTTPS; just trim.
  return safeString(url).replace(/^http:\/\//i, 'https://')
}

async function fetchJsonWithRetry(url) {
  let lastErr = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.json()
    } catch (e) {
      lastErr = e
      const wait = 600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400)
      console.warn(`Met request attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}`)
      if (attempt < MAX_ATTEMPTS) await sleep(wait)
    }
  }
  throw lastErr ?? new Error('Met fetch failed')
}

function nextMetId(existing) {
  let max = -1
  for (const row of existing) {
    const m = typeof row?.id === 'string' ? /^met-(\d+)$/.exec(row.id) : null
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

function buildDescription(obj) {
  const parts = []
  const objectName = safeString(obj?.objectName)
  const medium = safeString(obj?.medium)
  const creditLine = safeString(obj?.creditLine)
  if (objectName) parts.push(objectName)
  if (medium) parts.push(medium)
  if (creditLine) parts.push(creditLine)
  if (parts.length) return parts.join(' · ')
  return `Located at ${MET_MUSEUM_NAME}.`
}

function pickArtist(obj) {
  const artist =
    safeString(obj?.artistDisplayName) ||
    safeString(obj?.artistAlphaSort) ||
    safeString(obj?.culture) ||
    'Unknown'
  if (/^https?:\/\//i.test(artist)) return 'Unknown'
  return artist
}

function isUsableObject(obj) {
  if (!obj) return false
  if (obj.isPublicDomain !== true) return false
  const title = safeString(obj.title)
  if (!title || title.toLowerCase() === 'untitled') return false
  const img = normalizeMetImageUrl(obj.primaryImageSmall || obj.primaryImage || '')
  if (!img || !isValidImageUrl(img)) return false
  return true
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function main() {
  console.log('Fetching The Met objectIDs...')
  const objectsPayload = await fetchJsonWithRetry(MET_OBJECTS_URL)
  const objectIDs = Array.isArray(objectsPayload?.objectIDs) ? objectsPayload.objectIDs : []
  console.log(`Met objectIDs total: ${objectIDs.length}`)

  const existing = await loadExisting()
  const seenSourceUrls = new Set()
  const seenDedupeKeys = new Set()
  for (const row of existing) {
    if (row?.sourceUrl) seenSourceUrls.add(String(row.sourceUrl))
    const k = `${row?.title}-${row?.artist}-${row?.canonicalImageUrl ?? row?.imageUrl}`
    if (k) seenDedupeKeys.add(k)
  }

  let idCounter = nextMetId(existing)
  const added = []

  const idsToScan = objectIDs.slice(Math.max(0, START_OFFSET))
  const intervalMs = Math.max(10, Math.floor(1000 / Math.max(1, REQUESTS_PER_SECOND)))

  for (let i = 0; i < idsToScan.length; i += 1) {
    if (added.length >= MAX_OBJECTS) break
    const objectID = idsToScan[i]
    if (!Number.isFinite(Number(objectID))) continue

    // basic throttling: one request every intervalMs
    // (conservative; avoids bursty concurrency)
    if (i > 0) await sleep(intervalMs)

    let obj
    try {
      obj = await fetchJsonWithRetry(MET_OBJECT_URL(objectID))
    } catch {
      // keep going; failures are expected sometimes
      continue
    }

    if (!isUsableObject(obj)) continue

    const title = safeString(obj.title, 'Untitled')
    const artist = pickArtist(obj)
    const imageUrl = normalizeMetImageUrl(obj.primaryImageSmall || obj.primaryImage || '')
    const canonicalImageUrl = normalizeMetImageUrl(obj.primaryImage || obj.primaryImageSmall || '')
    const sourceUrl = safeString(obj.objectURL || obj.objectUrl || '', '')

    if (sourceUrl && seenSourceUrls.has(sourceUrl)) continue
    const dedupeKey = `${title}-${artist}-${canonicalImageUrl || imageUrl}`
    if (seenDedupeKeys.has(dedupeKey)) continue

    if (sourceUrl) seenSourceUrls.add(sourceUrl)
    seenDedupeKeys.add(dedupeKey)

    added.push({
      id: `met-${idCounter}`,
      title,
      artist,
      lat: MET_COORDS.lat,
      lng: MET_COORDS.lng,
      museum: MET_MUSEUM_NAME,
      description: buildDescription(obj),
      imageUrl,
      priority: 5,
      museumName: MET_MUSEUM_NAME,
      canonicalImageUrl,
      source: 'metmuseum',
      sourceUrl
    })
    idCounter += 1
  }

  const merged = [...existing, ...added]
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf8')

  console.log(`Added Met artworks: ${added.length} (cap FETCH_MET_MAX_OBJECTS=${MAX_OBJECTS})`)
  console.log(`Total in ${path.relative(process.cwd(), OUTPUT_PATH)}: ${merged.length}`)
  if (added.length === 0) {
    console.warn(
      'No Met items added. Try increasing FETCH_MET_MAX_OBJECTS or changing FETCH_MET_START_OFFSET.'
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

