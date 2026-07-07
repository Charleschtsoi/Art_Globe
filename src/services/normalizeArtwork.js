import { deriveTimePeriodKey, toPeriodKey } from '../constants/periods.js'
import { getCityForMuseum } from '../constants/museumCities.js'

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const toString = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function deriveTimePeriod(yearLike) {
  return deriveTimePeriodKey(yearLike)
}

export function normalizeArtwork(raw, index = 0) {
  const isPrdShape = Boolean(raw?.current_location || raw?.assets)
  const lat = isPrdShape ? toNumber(raw?.current_location?.lat) : toNumber(raw?.lat)
  const lng = isPrdShape ? toNumber(raw?.current_location?.lng) : toNumber(raw?.lng)
  if (lat === null || lng === null) return null

  const museum = isPrdShape
    ? toString(raw?.current_location?.museum, 'Unknown Museum')
    : toString(raw?.museumName ?? raw?.museum, 'Unknown Museum')
  const mappedCityEn = getCityForMuseum(museum, 'en')
  const city = isPrdShape
    ? toString(raw?.current_location?.city, mappedCityEn)
    : mappedCityEn
  const country = isPrdShape ? toString(raw?.current_location?.country) : ''
  const imageUrl = isPrdShape
    ? toString(raw?.assets?.thumbnail_url ?? raw?.assets?.high_res_url)
    : toString(raw?.imageUrl)
  const canonicalImageUrl = isPrdShape
    ? toString(raw?.assets?.high_res_url ?? raw?.assets?.thumbnail_url)
    : toString(raw?.canonicalImageUrl ?? raw?.imageUrl)
  if (!imageUrl) return null

  const creationYear = isPrdShape ? toString(raw?.creation_year) : toString(raw?.year)
  const title = toString(raw?.title, 'Untitled')
  const artist = toString(raw?.artist, 'Unknown Artist')
  const medium = toString(raw?.medium, 'Unknown medium')
  const historicalText = isPrdShape
    ? toString(raw?.historical_text)
    : toString(raw?.description)
  const timePeriod = toPeriodKey(raw?.time_period) ?? deriveTimePeriodKey(creationYear)

  const artworkId = String(raw?.artwork_id ?? raw?.id ?? `${title}-${index}`)

  const fallbackProse = `${title} is a notable work by ${artist}. Historical background will be expanded in future dataset updates.`

  return {
    artwork_id: artworkId,
    title,
    artist,
    creation_year: creationYear || 'Unknown',
    time_period: timePeriod,
    medium,
    current_location: {
      museum,
      city,
      country,
      lat,
      lng
    },
    assets: {
      thumbnail_url: imageUrl,
      high_res_url: isPrdShape
        ? toString(raw?.assets?.high_res_url || imageUrl)
        : imageUrl
    },
    historical_text: historicalText || fallbackProse,

    // Backward-compatible fields for existing rendering code
    id: artworkId,
    year: creationYear || 'Unknown',
    lat,
    lng,
    museumName: museum,
    description: historicalText || fallbackProse,
    imageUrl,
    canonicalImageUrl,
    source: raw?.source ?? 'local',
    sourceUrl: raw?.sourceUrl ?? ''
  }
}

export function normalizeArtworks(rawItems = []) {
  return rawItems
    .map((item, idx) => normalizeArtwork(item, idx))
    .filter(Boolean)
}
