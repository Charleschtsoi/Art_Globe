/* global process, Buffer */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const TARGET_COUNT = Number(process.env.FETCH_ARTWORKS_TARGET_COUNT ?? 300)
const CANDIDATE_MULTIPLIER = Number(process.env.FETCH_ARTWORKS_CANDIDATE_MULTIPLIER ?? 7)
const ASIA_SHARE = Number(process.env.FETCH_ARTWORKS_ASIA_SHARE ?? 0.72)
const EAST_ASIA_SHARE = Number(process.env.FETCH_ARTWORKS_EAST_ASIA_SHARE ?? 0.5)
const MIN_ASIA_SHARE = Number(process.env.FETCH_ARTWORKS_MIN_ASIA_SHARE ?? 0.65)
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/artworks')
const ART_DATA_PATH = path.resolve(process.cwd(), 'src/artData.js')
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'ArtGlobeFetcher/1.0 (educational project; contact: local-dev)'
const MIN_DELAY_MS = Number(process.env.FETCH_ARTWORKS_MIN_DELAY_MS ?? 180)
const MAX_DELAY_MS = Number(process.env.FETCH_ARTWORKS_MAX_DELAY_MS ?? 520)
const MAX_ATTEMPTS = Number(process.env.FETCH_ARTWORKS_MAX_ATTEMPTS ?? 6)

const buildSparqlQuery = (limit) => `
SELECT ?item ?itemLabel ?artistLabel ?image ?year ?museumLabel ?coord WHERE {
  ?item wdt:P31 wd:Q3305213;
        wdt:P18 ?image;
        wdt:P195 ?museum.
  OPTIONAL { ?item wdt:P170 ?artist. }
  OPTIONAL { ?item wdt:P571 ?inception. BIND(YEAR(?inception) AS ?year) }
  ?museum wdt:P625 ?coord.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

function parsePoint(pointValue) {
  const match = pointValue?.match(/^Point\(([-\d.]+)\s([-\d.]+)\)$/)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function safeString(value, fallback = 'Unknown') {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : fallback
}

function toJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
}

function imageUrlFromBinding(bindingValue) {
  const raw = safeString(bindingValue, '')
  if (!raw) return ''
  const https = raw.replace(/^http:\/\//i, 'https://')
  if (https.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
    return https.includes('?width=') ? https : `${https}?width=640`
  }
  return https
}

function classifyRegion(lat, lng) {
  const isEastAsia =
    lat >= 17 && lat <= 56 &&
    lng >= 98 && lng <= 151
  if (isEastAsia) return 'east_asia'

  const isAsia =
    lat >= -12 && lat <= 60 &&
    lng >= 25 && lng <= 170
  if (isAsia) return 'asia'

  if (lat >= 35 && lat <= 72 && lng >= -12 && lng <= 45) return 'europe'
  if (lat >= -60 && lat <= 83 && lng >= -170 && lng <= -35) return 'americas'
  return 'other'
}

async function fetchWikidataRows(limit) {
  const query = buildSparqlQuery(limit)
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Wikidata query failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data?.results?.bindings ?? []
}

async function downloadImage(url, filePath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Image download failed (${response.status})`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Non-image content type: ${contentType}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  await fs.writeFile(filePath, buffer)
  return buffer
}

async function downloadImageWithRetry(url, filePath, maxAttempts = 4) {
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const buffer = await downloadImage(url, filePath)
      return buffer
    } catch (error) {
      lastError = error
      const statusMatch = String(error?.message ?? '').match(/\((\d+)\)/)
      const statusCode = statusMatch ? Number(statusMatch[1]) : null
      const baseDelay = statusCode === 429 ? 1400 : 320
      const jitter = randInt(120, 540)
      const delay = baseDelay * 2 ** (attempt - 1) + jitter
      await sleep(delay)
    }
  }
  throw lastError ?? new Error('Image download failed')
}

async function cleanOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const names = await fs.readdir(OUTPUT_DIR)
  await Promise.all(
    names
      .filter((name) => /^art-\d+\.(jpg|jpeg|png|webp)$/i.test(name))
      .map((name) => fs.rm(path.join(OUTPUT_DIR, name), { force: true }))
  )
}

async function readExistingEasternArtBlock() {
  try {
    const current = await fs.readFile(ART_DATA_PATH, 'utf8')
    const marker = 'export const easternArtData ='
    const idx = current.indexOf(marker)
    if (idx === -1) return 'export const easternArtData = []\n'
    const block = current.slice(idx).trimEnd()
    return `${block}\n`
  } catch {
    return 'export const easternArtData = []\n'
  }
}

async function buildDataset() {
  await cleanOutputDir()
  const candidateLimit = Math.max(TARGET_COUNT, Math.round(TARGET_COUNT * CANDIDATE_MULTIPLIER))
  const rows = await fetchWikidataRows(candidateLimit)

  const harvested = []
  let fileIndex = 1
  const seenImageHashes = new Set()
  const seenEntityIds = new Set()

  for (const row of rows) {
    const coords = parsePoint(row.coord?.value)
    const remoteImageUrl = imageUrlFromBinding(row.image?.value)
    if (!coords || !remoteImageUrl) continue
    const entityUrl = safeString(row.item?.value, '')
    if (seenEntityIds.has(entityUrl)) continue

    const fileName = `art-${fileIndex}.jpg`
    const filePath = path.join(OUTPUT_DIR, fileName)

    try {
      const imageBuffer = await downloadImageWithRetry(remoteImageUrl, filePath, MAX_ATTEMPTS)
      const imageHash = crypto.createHash('sha1').update(imageBuffer).digest('hex')
      if (seenImageHashes.has(imageHash)) {
        await fs.rm(filePath, { force: true })
        await sleep(randInt(MIN_DELAY_MS, MAX_DELAY_MS))
        continue
      }
      seenImageHashes.add(imageHash)
      seenEntityIds.add(entityUrl)
      const region = classifyRegion(coords.lat, coords.lng)
      harvested.push({
        id: fileIndex,
        title: safeString(row.itemLabel?.value, 'Untitled'),
        artist: safeString(row.artistLabel?.value, 'Unknown'),
        year: row.year?.value ? Number(row.year.value) || row.year.value : 'Unknown',
        lat: coords.lat,
        lng: coords.lng,
        imageUrl: `/artworks/${fileName}`,
        canonicalImageUrl: remoteImageUrl,
        description: `Located at ${safeString(row.museumLabel?.value, 'Unknown Museum')}.`,
        museumName: safeString(row.museumLabel?.value, 'Unknown Museum'),
        source: 'wikidata',
        sourceUrl: safeString(row.item?.value, 'https://www.wikidata.org'),
        region
      })
      fileIndex += 1
      await sleep(randInt(MIN_DELAY_MS, MAX_DELAY_MS))
    } catch (error) {
      console.warn(`Skipping image ${fileIndex}: ${error.message}`)
      await fs.rm(filePath, { force: true })
      await sleep(randInt(MIN_DELAY_MS + 80, MAX_DELAY_MS + 280))
    }
  }

  const eastAsiaTarget = Math.max(0, Math.round(TARGET_COUNT * EAST_ASIA_SHARE))
  const asiaTarget = Math.max(eastAsiaTarget, Math.round(TARGET_COUNT * ASIA_SHARE))
  const eastAsiaPool = harvested.filter((item) => item.region === 'east_asia')
  const asiaPool = harvested.filter((item) => item.region === 'asia')
  const globalPool = harvested.filter((item) => item.region !== 'east_asia' && item.region !== 'asia')
  const selected = [
    ...eastAsiaPool.slice(0, eastAsiaTarget)
  ]

  for (const item of asiaPool) {
    if (selected.length >= asiaTarget) break
    selected.push(item)
  }
  for (const item of globalPool) {
    if (selected.length >= TARGET_COUNT) break
    selected.push(item)
  }
  for (const item of harvested) {
    if (selected.length >= TARGET_COUNT) break
    if (selected.some((s) => s.sourceUrl === item.sourceUrl)) continue
    selected.push(item)
  }

  return selected.map((item, idx) => ({
    ...item,
    id: idx + 1
  }))
}

async function writeArtDataFile(artworks) {
  const easternArtBlock = await readExistingEasternArtBlock()
  const lines = artworks.map((art) => `  {
    id: ${art.id},
    title: '${toJsString(art.title)}',
    artist: '${toJsString(art.artist)}',
    year: ${typeof art.year === 'number' ? art.year : `'${toJsString(art.year)}'`},
    lat: ${art.lat},
    lng: ${art.lng},
    imageUrl: '${toJsString(art.imageUrl)}',
    canonicalImageUrl: '${toJsString(art.canonicalImageUrl || '')}',
    description: '${toJsString(art.description)}',
    museumName: '${toJsString(art.museumName)}',
    source: '${toJsString(art.source)}',
    sourceUrl: '${toJsString(art.sourceUrl)}'
  }`)

  const fileContents = `export const artworks = [\n${lines.join(',\n')}\n]\n\n${easternArtBlock}`
  await fs.writeFile(ART_DATA_PATH, fileContents, 'utf8')
}

async function main() {
  console.log('Fetching artworks from Wikidata...')
  const artworks = await buildDataset()
  const regionCounts = artworks.reduce((acc, item) => {
    const key = item.region || 'other'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const asiaCount = (regionCounts.east_asia || 0) + (regionCounts.asia || 0)
  const asiaShare = artworks.length ? asiaCount / artworks.length : 0
  console.log(
    `Region balance -> East Asia: ${regionCounts.east_asia || 0}, Asia: ${regionCounts.asia || 0}, Europe: ${regionCounts.europe || 0}, Americas: ${regionCounts.americas || 0}, Other: ${regionCounts.other || 0}`
  )
  console.log(`Asia+East Asia share: ${(asiaShare * 100).toFixed(1)}%`)
  if (artworks.length > 0 && asiaShare < MIN_ASIA_SHARE) {
    throw new Error(
      `Asia share ${(asiaShare * 100).toFixed(1)}% is below configured minimum ${(MIN_ASIA_SHARE * 100).toFixed(1)}%`
    )
  }
  await writeArtDataFile(artworks)
  console.log(`Saved ${artworks.length} artworks to ${ART_DATA_PATH}`)
  console.log(`Downloaded images to ${OUTPUT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
