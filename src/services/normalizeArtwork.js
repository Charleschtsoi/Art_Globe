import { deriveTimePeriodKey, toPeriodKey } from '../constants/periods.js'
import { getCityForMuseum } from '../constants/museumCities.js'
import {
  collectImageCandidates,
  detectImageProvider,
  isHttpsImageUrl,
  isLikelyImageUrl,
  isLocalArtworkPath,
  isPlaceholderImageUrl,
  resizeImageUrl
} from '../lib/imageResolver.js'

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

function buildSourcesFromRaw(raw, candidates) {
  const existing = Array.isArray(raw?.assets?.sources) ? raw.assets.sources : []
  if (existing.length > 0) {
    return existing
      .filter((s) => s && typeof s.url === 'string' && isLikelyImageUrl(s.url))
      .map((s, idx) => ({
        provider: s.provider || detectImageProvider(s.url),
        url: s.url.trim().replace(/^http:\/\//i, 'https://'),
        role: s.role || (idx === 0 ? 'primary' : 'fallback')
      }))
  }

  return candidates.map((url, idx) => ({
    provider: detectImageProvider(url),
    url,
    role: idx === 0 ? 'primary' : 'fallback'
  }))
}

function pickPrimaryExternalUrl(raw, candidates) {
  const canonical = toString(raw?.canonicalImageUrl)
  if (isLikelyImageUrl(canonical)) {
    return canonical.replace(/^http:\/\//i, 'https://')
  }
  if (candidates.length > 0) return candidates[0]
  return ''
}

function pickLocalFallback(raw) {
  const fields = [
    raw?.imageUrl,
    raw?.assets?.thumbnail_url,
    raw?.assets?.high_res_url
  ]
  for (const field of fields) {
    if (typeof field === 'string' && isLocalArtworkPath(field)) return field.trim()
  }
  return ''
}

/**
 * Merge probe cache entry into normalized artwork image fields.
 * @param {Record<string, unknown>} artwork
 * @param {Record<string, unknown> | undefined} probeEntry
 */
export function applyImageAvailability(artwork, probeEntry) {
  if (!probeEntry || typeof probeEntry !== 'object') return artwork

  const availability = toString(probeEntry.availability, 'unknown')
  const winningUrl = toString(probeEntry.winningUrl)
  const checkedAt = toString(probeEntry.checkedAt)

  const next = { ...artwork, assets: { ...(artwork.assets ?? {}) } }

  if (availability === 'ok' && winningUrl) {
    next.imageUrl = resizeImageUrl(winningUrl, 'thumb')
    next.canonicalImageUrl = winningUrl.replace(/^http:\/\//i, 'https://')
    next.assets.thumbnail_url = next.imageUrl
    next.assets.high_res_url = resizeImageUrl(winningUrl, 'detail')
  } else if (availability === 'broken') {
    if (isHttpsImageUrl(next.assets.thumbnail_url)) {
      next.assets.thumbnail_url = ''
    }
    if (isHttpsImageUrl(next.assets.high_res_url)) {
      next.assets.high_res_url = ''
    }
    if (isHttpsImageUrl(next.imageUrl)) {
      next.imageUrl = ''
    }
    if (isHttpsImageUrl(next.canonicalImageUrl)) {
      next.canonicalImageUrl = ''
    }
  }

  next.assets.availability = availability
  if (checkedAt) next.assets.checkedAt = checkedAt
  if (winningUrl) next.assets.probedUrl = winningUrl

  return next
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

  const draft = {
    ...raw,
    imageUrl: isPrdShape
      ? toString(raw?.assets?.thumbnail_url ?? raw?.assets?.high_res_url ?? raw?.imageUrl)
      : toString(raw?.imageUrl),
    canonicalImageUrl: isPrdShape
      ? toString(raw?.assets?.high_res_url ?? raw?.canonicalImageUrl ?? raw?.imageUrl)
      : toString(raw?.canonicalImageUrl ?? raw?.imageUrl),
    assets: raw?.assets ?? {}
  }

  const candidates = collectImageCandidates(draft)
  const localFallback = pickLocalFallback(raw)
  const primaryExternal = pickPrimaryExternalUrl(raw, candidates)
  const sources = buildSourcesFromRaw(raw, candidates)

  let imageUrl = ''
  let canonicalImageUrl = ''

  if (primaryExternal) {
    canonicalImageUrl = primaryExternal
    imageUrl = resizeImageUrl(primaryExternal, 'thumb')
  } else if (localFallback) {
    imageUrl = localFallback
    canonicalImageUrl = toString(raw?.canonicalImageUrl) || localFallback
  } else if (isLikelyImageUrl(draft.imageUrl)) {
    imageUrl = resizeImageUrl(draft.imageUrl, 'thumb')
    canonicalImageUrl = isLikelyImageUrl(draft.canonicalImageUrl) ? draft.canonicalImageUrl : draft.imageUrl
  } else {
    imageUrl = toString(draft.imageUrl)
    canonicalImageUrl = toString(draft.canonicalImageUrl)
  }

  if (!imageUrl && !primaryExternal && !localFallback) return null

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

  const highResUrl = primaryExternal
    ? resizeImageUrl(primaryExternal, 'detail')
    : isHttpsImageUrl(canonicalImageUrl)
      ? resizeImageUrl(canonicalImageUrl, 'detail')
      : imageUrl

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
      high_res_url: highResUrl,
      sources,
      availability: toString(raw?.assets?.availability, candidates.length > 0 || localFallback ? 'unknown' : 'none'),
      checkedAt: toString(raw?.assets?.checkedAt)
    },
    historical_text: historicalText || fallbackProse,

    id: artworkId,
    year: creationYear || 'Unknown',
    lat,
    lng,
    museumName: museum,
    description: historicalText || fallbackProse,
    imageUrl,
    canonicalImageUrl: canonicalImageUrl || imageUrl,
    source: raw?.source ?? 'local',
    sourceUrl: raw?.sourceUrl ?? ''
  }
}

export function normalizeArtworks(rawItems = []) {
  return rawItems
    .map((item, idx) => normalizeArtwork(item, idx))
    .filter(Boolean)
}
