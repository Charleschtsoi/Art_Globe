/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-candidates.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-enriched.json')
const MIN_LOCATION_CONFIDENCE = Number(process.env.WIKIART_MIN_LOCATION_CONFIDENCE ?? 0.7)
const USER_AGENT = 'ArtGlobeWikiArtEnricher/1.0 (research pipeline)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT }
  })
  if (!response.ok) throw new Error(`request failed ${response.status} for ${url}`)
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
    ''
  )
}

function locationConfidence(location) {
  if (!location) return 0
  if (location.city && Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.92
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) return 0.75
  return 0.3
}

async function wikipediaSearchTitle(artistName) {
  const q = `${artistName} painter`
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5`
  const data = await getJson(url)
  const hits = data?.query?.search ?? []
  return hits.map((h) => h.title).filter(Boolean)
}

async function resolveArtistLocationFromWikiTitle(pageTitle, cache) {
  const key = pageTitle
  if (cache.has(key)) return cache.get(key)

  try {
    const wikiApi = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=${encodeURIComponent(pageTitle)}`
    const wikiData = await getJson(wikiApi)
    const pages = wikiData?.query?.pages ? Object.values(wikiData.query.pages) : []
    const wikibaseItem = pages[0]?.pageprops?.wikibase_item
    if (!wikibaseItem) {
      cache.set(key, null)
      return null
    }

    const entityApi = `https://www.wikidata.org/wiki/Special:EntityData/${wikibaseItem}.json`
    const entityData = await getJson(entityApi)
    const entity = entityData?.entities?.[wikibaseItem]
    if (!entity) {
      cache.set(key, null)
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
      lng,
      wikipediaTitle: pageTitle
    }
    cache.set(key, resolved)
    return resolved
  } catch {
    cache.set(key, null)
    return null
  }
}

async function resolveArtistByName(artistName, cacheByTitle, triedArtists) {
  if (triedArtists.has(artistName)) return triedArtists.get(artistName)
  const titles = await wikipediaSearchTitle(artistName)
  await sleep(80)
  let best = null
  for (const title of titles) {
    const loc = await resolveArtistLocationFromWikiTitle(title, cacheByTitle)
    await sleep(60)
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      best = loc
      break
    }
    if (!best && loc) best = loc
  }
  triedArtists.set(artistName, best)
  return best
}

function buildDescription(candidate, location) {
  const artist = safeText(candidate.artist)
  const style = safeText(candidate.style)
  const city = safeText(location?.city)
  const parts = [`${artist} — ${candidate.title} (${style}).`]
  if (city) parts.push(` Placed at artist birthplace ${city} for globe visualization.`)
  return parts.join('')
}

async function main() {
  const inputRaw = await fs.readFile(INPUT_PATH, 'utf8')
  const parsed = JSON.parse(inputRaw)
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : []
  if (!candidates.length) throw new Error('No WikiArt candidates. Run scripts/import-wikiart.mjs and set WIKIART_ROOT.')

  const cacheByTitle = new Map()
  const triedArtists = new Map()
  const locationByArtist = new Map()
  const uniqueArtists = [...new Set(candidates.map((c) => safeText(c.artist)).filter(Boolean))]
  console.log(`WikiArt enrichment: resolving ${uniqueArtists.length} unique artists…`)
  for (let a = 0; a < uniqueArtists.length; a += 1) {
    const artistName = uniqueArtists[a]
    const loc = await resolveArtistByName(artistName, cacheByTitle, triedArtists)
    locationByArtist.set(artistName, loc)
    if ((a + 1) % 25 === 0) console.log(`  artist location ${a + 1}/${uniqueArtists.length}`)
  }

  const enriched = []
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
    const museum = city ? `${artist} Birthplace Collection` : `${artist} Archive`

    const wikiPage = safeText(artistLocation?.wikipediaTitle)
    const wikiUrl = wikiPage
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiPage.replace(/ /g, '_'))}`
      : ''

    const confidence = {
      title: 0.55,
      artist: 0.95,
      location: Number(locationScore.toFixed(2)),
      museum: city ? 0.55 : 0.38,
      overall: Number(
        (0.2 * 0.55 + 0.2 * 0.95 + 0.35 * locationScore + 0.25 * (city ? 0.55 : 0.38)).toFixed(2)
      )
    }

    enriched.push({
      candidateId: candidate.candidateId,
      source: 'wikiart',
      title: safeText(candidate.title, 'Untitled'),
      artist,
      year: 'Unknown',
      description: buildDescription(candidate, artistLocation),
      museum,
      city,
      country,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      localImagePath: candidate.localImagePath,
      canonicalImageUrl: wikiUrl,
      priority: 4,
      confidence,
      metadata: {
        style: candidate.style,
        pathDepth: candidate.pathDepth,
        relativePath: candidate.relativePath,
        artistWikipedia: wikiUrl,
        wikidataArtistId: artistLocation?.wikidataArtistId ?? '',
        birthPlaceQid: artistLocation?.birthPlaceQid ?? ''
      }
    })

    if ((index + 1) % 500 === 0) {
      console.log(`WikiArt enrichment: ${index + 1}/${candidates.length}`)
    }
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

  console.log(`WikiArt enrichment complete. Records: ${enriched.length}`)
  console.log(`Low-confidence location (below internal threshold note): ${unresolvedLocation}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
