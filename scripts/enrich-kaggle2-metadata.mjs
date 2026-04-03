/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createFetchJsonRetry } from './fetch-json-retry.mjs'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle2-candidates.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle2-enriched.json')
const MIN_LOCATION_CONFIDENCE = Number(process.env.KAGGLE2_MIN_LOCATION_CONFIDENCE ?? 0.65)
const USER_AGENT =
  'ArtGlobeKaggle2Enricher/1.0 (+https://github.com/charlescht/Art_Globe; research pipeline)'
const REQUEST_TIMEOUT_MS = Number(process.env.KAGGLE2_REQUEST_TIMEOUT_MS ?? 8000)
const REQUEST_MIN_INTERVAL_MS = Number(process.env.KAGGLE2_REQUEST_MIN_INTERVAL_MS ?? 150)

const getJson = createFetchJsonRetry({
  userAgent: USER_AGENT,
  timeoutMs: REQUEST_TIMEOUT_MS,
  minIntervalMs: REQUEST_MIN_INTERVAL_MS
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function parseEntityId(claim) {
  return claim?.mainsnak?.datavalue?.value?.id ?? ''
}

function parseCoordinatesClaim(claim) {
  const value = claim?.mainsnak?.datavalue?.value
  if (!value) return null
  const lat = Number(value.latitude)
  const lng = Number(value.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function getBestLabel(entity, lang = 'en') {
  return entity?.labels?.[lang]?.value || entity?.labels?.en?.value || ''
}

function locationConfidence(location) {
  if (!location) return 0
  if (location.city && Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.9
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.72
  return 0.3
}

async function wikipediaSearchTitle(artistName) {
  const q = `${artistName} artist`
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5`
  const data = await getJson(url)
  const hits = data?.query?.search ?? []
  return hits.map((h) => h.title).filter(Boolean)
}

async function resolveArtistLocationFromWikiTitle(pageTitle, cache) {
  if (cache.has(pageTitle)) return cache.get(pageTitle)
  try {
    const wikiApi = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=${encodeURIComponent(pageTitle)}`
    const wikiData = await getJson(wikiApi)
    const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : []
    const wikibaseItem = pages[0]?.pageprops?.wikibase_item
    if (!wikibaseItem) {
      cache.set(pageTitle, null)
      return null
    }

    const entityApi = `https://www.wikidata.org/wiki/Special:EntityData/${wikibaseItem}.json`
    const entityData = await getJson(entityApi)
    const entity = entityData?.entities?.[wikibaseItem]
    if (!entity) {
      cache.set(pageTitle, null)
      return null
    }

    const birthPlaceEntityId = parseEntityId(entity?.claims?.P19?.[0])
    const citizenshipEntityId = parseEntityId(entity?.claims?.P27?.[0])
    let city = ''
    let country = ''
    let lat = null
    let lng = null
    let birthPlaceQid = ''
    if (birthPlaceEntityId) {
      const birthApi = `https://www.wikidata.org/wiki/Special:EntityData/${birthPlaceEntityId}.json`
      const birthData = await getJson(birthApi)
      const birthEntity = birthData?.entities?.[birthPlaceEntityId]
      if (birthEntity) {
        city = getBestLabel(birthEntity, 'en')
        const coords = parseCoordinatesClaim(birthEntity?.claims?.P625?.[0])
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
        birthPlaceQid = birthPlaceEntityId
      }
      await sleep(50)
    }
    if (citizenshipEntityId) {
      const countryApi = `https://www.wikidata.org/wiki/Special:EntityData/${citizenshipEntityId}.json`
      const countryData = await getJson(countryApi)
      const countryEntity = countryData?.entities?.[citizenshipEntityId]
      if (countryEntity) country = getBestLabel(countryEntity, 'en')
      await sleep(50)
    }
    const resolved = {
      wikidataArtistId: wikibaseItem,
      birthPlaceQid,
      city: safeText(city),
      country: safeText(country),
      lat,
      lng,
      wikipediaTitle: pageTitle
    }
    cache.set(pageTitle, resolved)
    return resolved
  } catch {
    cache.set(pageTitle, null)
    return null
  }
}

async function resolveArtistByName(artistName, cacheByTitle, triedArtists) {
  if (triedArtists.has(artistName)) return triedArtists.get(artistName)
  const titles = await wikipediaSearchTitle(artistName)
  await sleep(60)
  let best = null
  for (const title of titles) {
    const loc = await resolveArtistLocationFromWikiTitle(title, cacheByTitle)
    await sleep(40)
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      best = loc
      break
    }
    if (!best && loc) best = loc
  }
  triedArtists.set(artistName, best)
  return best
}

function inferPeriodFromYear(yearText) {
  const year = Number(String(yearText).match(/\d{3,4}/)?.[0])
  if (!Number.isFinite(year)) return 'modern'
  if (year < 1500) return 'antiquity'
  if (year < 1650) return 'renaissance'
  if (year < 1800) return 'baroque'
  if (year < 1915) return 'impressionism'
  return 'modern'
}

async function main() {
  const inputRaw = await fs.readFile(INPUT_PATH, 'utf8')
  const parsed = JSON.parse(inputRaw)
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : []
  if (!candidates.length) throw new Error('No Kaggle2 candidates. Run kaggle2:import first.')

  const cacheByTitle = new Map()
  const triedArtists = new Map()
  const locationByArtist = new Map()
  const uniqueArtists = [...new Set(candidates.map((c) => safeText(c.artist)).filter(Boolean))]
  console.log(`Kaggle2 enrichment: resolving ${uniqueArtists.length} artists...`)
  for (let i = 0; i < uniqueArtists.length; i += 1) {
    const artistName = uniqueArtists[i]
    const loc = await resolveArtistByName(artistName, cacheByTitle, triedArtists)
    locationByArtist.set(artistName, loc)
    if ((i + 1) % 100 === 0) console.log(`  artist location ${i + 1}/${uniqueArtists.length}`)
  }

  const records = []
  let unresolvedLocation = 0
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const artist = safeText(candidate.artist)
    const artistLocation = locationByArtist.get(artist) ?? null
    const locationScore = locationConfidence(artistLocation)
    if (locationScore < MIN_LOCATION_CONFIDENCE) unresolvedLocation += 1
    const city = safeText(artistLocation?.city)
    const country = safeText(artistLocation?.country)
    const lat = Number(artistLocation?.lat)
    const lng = Number(artistLocation?.lng)

    const confidence = {
      title: 0.85,
      artist: 0.96,
      location: Number(locationScore.toFixed(2)),
      museum: 0.92,
      overall: Number((0.2 * 0.85 + 0.2 * 0.96 + 0.35 * locationScore + 0.25 * 0.92).toFixed(2))
    }

    records.push({
      candidateId: candidate.candidateId,
      source: 'kaggle2',
      title: safeText(candidate.title, 'Untitled'),
      artist,
      year: safeText(candidate.yearText, 'Unknown'),
      year_text: safeText(candidate.yearText, 'Unknown'),
      description: `${safeText(candidate.title, 'Untitled')} by ${artist}.`,
      museum: 'Museum of Modern Art',
      museumName: 'Museum of Modern Art',
      city,
      country,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      time_period: inferPeriodFromYear(candidate.yearText),
      medium: safeText(candidate.medium),
      canonicalImageUrl: '',
      priority: 3,
      confidence,
      metadata: {
        classification: candidate.classification,
        department: candidate.department,
        nationality: candidate.nationality,
        wikidataArtistId: artistLocation?.wikidataArtistId ?? '',
        birthPlaceQid: artistLocation?.birthPlaceQid ?? ''
      }
    })
    if ((index + 1) % 1000 === 0) console.log(`Kaggle2 enrichment: ${index + 1}/${candidates.length}`)
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputCount: candidates.length,
        unresolvedLocationCount: unresolvedLocation,
        minLocationConfidence: MIN_LOCATION_CONFIDENCE,
        records
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Kaggle2 enrichment complete. Records: ${records.length}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

