/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/archive3-candidates.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/archive3-enriched.json')
const MIN_LOCATION_CONFIDENCE = Number(process.env.ARCHIVE3_MIN_LOCATION_CONFIDENCE ?? 0.7)
const USER_AGENT = 'ArtGlobeArchive3Enricher/1.0 (research pipeline)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function decodeWikiTitle(url) {
  const raw = safeText(url)
  const title = raw.split('/wiki/')[1]
  if (!title) return ''
  try {
    return decodeURIComponent(title)
  } catch {
    return title
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`request failed ${response.status} for ${url}`)
  }
  return response.json()
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
  return (
    entity?.labels?.[lang]?.value ||
    entity?.labels?.en?.value ||
    entity?.labels?.zh?.value ||
    entity?.labels?.['zh-hant']?.value ||
    ''
  )
}

function buildFallbackDescription(candidate) {
  const artist = safeText(candidate.artist, 'Unknown Artist')
  const years = safeText(candidate.years, 'unknown period')
  const genre = safeText(candidate.genre, 'art')
  return `${artist} (${years}) - ${genre}. Imported from archive-3 and enriched with artist-level location metadata.`
}

function locationConfidence(location) {
  if (!location) return 0
  if (location.city && Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.92
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.75
  return 0.3
}

async function resolveArtistLocation(wikipediaUrl, cache) {
  const url = safeText(wikipediaUrl)
  if (!url) return null
  if (cache.has(url)) return cache.get(url)

  try {
    const pageTitle = decodeWikiTitle(url)
    if (!pageTitle) {
      cache.set(url, null)
      return null
    }

    const wikiApi = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=${encodeURIComponent(pageTitle)}`
    const wikiData = await getJson(wikiApi)
    const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : []
    const wikibaseItem = pages[0]?.pageprops?.wikibase_item
    if (!wikibaseItem) {
      cache.set(url, null)
      return null
    }

    const entityApi = `https://www.wikidata.org/wiki/Special:EntityData/${wikibaseItem}.json`
    const entityData = await getJson(entityApi)
    const entity = entityData?.entities?.[wikibaseItem]
    if (!entity) {
      cache.set(url, null)
      return null
    }

    const birthPlaceEntityId = parseEntityId(entity?.claims?.P19?.[0])
    const citizenshipEntityId = parseEntityId(entity?.claims?.P27?.[0])

    let city = ''
    let country = ''
    let lat = null
    let lng = null
    let birthPlaceLabel = ''
    let birthPlaceQid = ''

    if (birthPlaceEntityId) {
      const birthApi = `https://www.wikidata.org/wiki/Special:EntityData/${birthPlaceEntityId}.json`
      const birthData = await getJson(birthApi)
      const birthEntity = birthData?.entities?.[birthPlaceEntityId]
      if (birthEntity) {
        birthPlaceLabel = getBestLabel(birthEntity, 'en')
        const coords = parseCoordinatesClaim(birthEntity?.claims?.P625?.[0])
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
        city = birthPlaceLabel
        birthPlaceQid = birthPlaceEntityId
      }
      await sleep(70)
    }

    if (citizenshipEntityId) {
      const countryApi = `https://www.wikidata.org/wiki/Special:EntityData/${citizenshipEntityId}.json`
      const countryData = await getJson(countryApi)
      const countryEntity = countryData?.entities?.[citizenshipEntityId]
      if (countryEntity) country = getBestLabel(countryEntity, 'en')
      await sleep(70)
    }

    const resolved = {
      wikidataArtistId: wikibaseItem,
      birthPlaceQid,
      city: safeText(city),
      country: safeText(country),
      lat,
      lng
    }
    cache.set(url, resolved)
    return resolved
  } catch {
    cache.set(url, null)
    return null
  }
}

async function main() {
  const inputRaw = await fs.readFile(INPUT_PATH, 'utf8')
  const parsed = JSON.parse(inputRaw)
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : []
  if (!candidates.length) throw new Error('No archive3 candidates found. Run scripts/import-archive3.mjs first.')

  const locationCache = new Map()
  const enriched = []
  let unresolvedLocation = 0

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const artistLocation = await resolveArtistLocation(candidate.wikipedia, locationCache)
    const locationScore = locationConfidence(artistLocation)
    if (locationScore < MIN_LOCATION_CONFIDENCE) unresolvedLocation += 1

    const city = safeText(artistLocation?.city)
    const country = safeText(artistLocation?.country)
    const lat = Number(artistLocation?.lat)
    const lng = Number(artistLocation?.lng)
    const title = `${candidate.artist} work #${candidate.sequence}`
    const museum = city ? `${candidate.artist} Birthplace Collection` : `${candidate.artist} Archive`
    const confidence = {
      title: 0.55,
      artist: 0.98,
      location: Number(locationScore.toFixed(2)),
      museum: city ? 0.58 : 0.4,
      overall: Number((0.2 * 0.55 + 0.2 * 0.98 + 0.35 * locationScore + 0.25 * (city ? 0.58 : 0.4)).toFixed(2))
    }

    enriched.push({
      candidateId: candidate.candidateId,
      source: 'archive3',
      title,
      artist: candidate.artist,
      year: candidate.years,
      description: buildFallbackDescription(candidate),
      museum,
      city,
      country,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      localImagePath: candidate.localImagePath,
      canonicalImageUrl: safeText(candidate.wikipedia),
      priority: 4,
      confidence,
      metadata: {
        genre: candidate.genre,
        nationality: candidate.nationality,
        artistWikipedia: candidate.wikipedia,
        wikidataArtistId: artistLocation?.wikidataArtistId ?? '',
        birthPlaceQid: artistLocation?.birthPlaceQid ?? ''
      }
    })

    if ((index + 1) % 100 === 0) {
      console.log(`Enrichment progress: ${index + 1}/${candidates.length}`)
    }
    await sleep(40)
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
        records: enriched
      },
      null,
      2
    ),
    'utf8'
  )
  console.log(`Archive-3 enrichment complete. Records: ${enriched.length}`)
  console.log(`Low-confidence location records: ${unresolvedLocation}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
