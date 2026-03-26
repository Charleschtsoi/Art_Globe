/* global process */
/**
 * Fetch paintings from Wikidata whose holding institution (P195) is in
 * Australia, New Zealand, or Southeast Asia (P17 country filter).
 * Merges into src/data/externalArtData.json (does not replace existing rows).
 *
 * Run: npm run fetch:oceania-seasia
 * Env: FETCH_OCEANIA_SPARQL_LIMIT (default 500), FETCH_OCEANIA_MAX_NEW (default 200)
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'ArtGlobeOceaniaSeAsia/1.0 (educational; Art Globe)'

const SPARQL_LIMIT = Number(process.env.FETCH_OCEANIA_SPARQL_LIMIT ?? 500)
const MAX_NEW = Number(process.env.FETCH_OCEANIA_MAX_NEW ?? 200)
const MIN_IMAGE_SIZE = 400

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parsePoint(pointValue) {
  const match = pointValue?.match(/^Point\(([-\d.]+)\s([-\d.]+)\)$/)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function safeString(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : fallback
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false
  return true
}

function isHighResUrl(url) {
  if (!url) return false
  const m = url.match(/(\d+)px|width=(\d+)|height=(\d+)|(\d+)x(\d+)/i)
  if (m) {
    const nums = m.slice(1).filter(Boolean).map(Number)
    if (nums.length && nums.every((n) => n < MIN_IMAGE_SIZE)) return false
  }
  return true
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

const buildSparqlQuery = (limit) => `
SELECT ?item ?itemLabel ?artistLabel ?image ?year ?museumLabel ?coord WHERE {
  VALUES ?country {
    wd:Q408 wd:Q664 wd:Q334 wd:Q252 wd:Q869 wd:Q881 wd:Q833 wd:Q928 wd:Q836 wd:Q424
  }
  ?item wdt:P31 wd:Q3305213;
        wdt:P18 ?image;
        wdt:P195 ?museum.
  ?museum wdt:P17 ?country;
          wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P170 ?artist. }
  OPTIONAL { ?item wdt:P571 ?inception. BIND(YEAR(?inception) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`

async function fetchWikidataRows() {
  const query = buildSparqlQuery(SPARQL_LIMIT)
  const url = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`
  const maxAttempts = Number(process.env.FETCH_OCEANIA_WIKIDATA_ATTEMPTS ?? 4)
  let lastErr = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
    } catch (e) {
      lastErr = e
      const wait = 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400)
      console.warn(`Wikidata request attempt ${attempt}/${maxAttempts} failed: ${e.message}`)
      if (attempt < maxAttempts) await sleep(wait)
    }
  }
  throw lastErr ?? new Error('Wikidata fetch failed')
}

function nextOceaniaId(existing) {
  let max = -1
  for (const row of existing) {
    const m = typeof row?.id === 'string' ? /^oceania-seasia-(\d+)$/.exec(row.id) : null
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

async function main() {
  console.log('Fetching Wikidata paintings (Oceania + Southeast Asia museums)...')
  const rows = await fetchWikidataRows()
  await sleep(400)

  let existing = []
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8')
    existing = JSON.parse(raw)
    if (!Array.isArray(existing)) existing = []
  } catch {
    existing = []
  }

  const seenItemUrls = new Set()
  const seenDedupeKeys = new Set()
  for (const row of existing) {
    if (row?.sourceUrl && String(row.sourceUrl).includes('wikidata.org')) {
      seenItemUrls.add(row.sourceUrl)
    }
    const k = `${row?.title}-${row?.artist}-${row?.canonicalImageUrl ?? row?.imageUrl}`
    if (k) seenDedupeKeys.add(k)
  }

  let idCounter = nextOceaniaId(existing)
  const newItems = []

  for (const row of rows) {
    if (newItems.length >= MAX_NEW) break
    const itemUrl = safeString(row.item?.value, '')
    if (!itemUrl || seenItemUrls.has(itemUrl)) continue

    const coords = parsePoint(row.coord?.value)
    const imageUrl = imageUrlFromBinding(row.image?.value)
    if (!coords || !isValidImageUrl(imageUrl) || !isHighResUrl(imageUrl)) continue

    const museumName = safeString(row.museumLabel?.value, '')
    if (!museumName) continue

    const title = safeString(row.itemLabel?.value, 'Untitled')
    if (!title || title === 'Untitled') continue

    let artist = safeString(row.artistLabel?.value, 'Unknown')
    if (/^https?:\/\//i.test(artist)) artist = 'Unknown'

    const dedupeKey = `${title}-${artist}-${imageUrl}`
    if (seenDedupeKeys.has(dedupeKey)) continue

    seenItemUrls.add(itemUrl)
    seenDedupeKeys.add(dedupeKey)

    const id = `oceania-seasia-${idCounter}`
    idCounter += 1

    const description = `Located at ${museumName}.`

    newItems.push({
      id,
      title,
      artist,
      lat: coords.lat,
      lng: coords.lng,
      museum: museumName,
      description,
      imageUrl,
      priority: 4,
      museumName,
      canonicalImageUrl: imageUrl,
      source: 'wikidata',
      sourceUrl: itemUrl
    })
  }

  const merged = [...existing, ...newItems]
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf8')

  console.log(`Wikidata rows returned: ${rows.length}`)
  console.log(`Appended ${newItems.length} new artworks (cap FETCH_OCEANIA_MAX_NEW=${MAX_NEW})`)
  console.log(`Total in ${path.relative(process.cwd(), OUTPUT_PATH)}: ${merged.length}`)
  console.log('Next step: run `npm run localize:external` to cache remote thumbnails locally.')
  if (newItems.length === 0) {
    console.warn('No new items added (duplicate run, empty query, or filters skipped all rows).')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
