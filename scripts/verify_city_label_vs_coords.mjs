/**
 * Verify whether the city label used for globe markers (Beijing/Hanoi in particular)
 * matches the physical lat/lng placement across far/mid/near zoom bands.
 *
 * This is a rough geospatial sanity check (bounding boxes) rather than an exact
 * "pixel-perfect" Google Maps comparison.
 */

import { artworks, easternArtData } from '../src/artData.js'
import fs from 'node:fs/promises'
import { normalizeArtworks } from '../src/services/normalizeArtwork.js'
import { localizeArtworkDisplay } from '../src/i18n/localizeArtworkDisplay.js'
import { resolveLodData } from '../src/services/artLod.js'

function spreadOutArtworks(data) {
  const locationCounts = {}
  return data.map((art) => {
    const locKey = `${art.lat}-${art.lng}`
    if (!locationCounts[locKey]) locationCounts[locKey] = 0
    const count = locationCounts[locKey]
    locationCounts[locKey] += 1
    if (count === 0) return art
    const radius = 0.005 + count * 0.002
    const angle = count * 1.5
    return {
      ...art,
      lat: art.lat + radius * Math.cos(angle),
      lng: art.lng + radius * Math.sin(angle)
    }
  })
}

function parseCityFromClusterTitle(title) {
  const s = String(title ?? '').trim()
  const m = s.match(/^(.+?)\s*\(\d+\)\s*$/)
  return (m?.[1] ?? s).trim()
}

function withinBox({ lat, lng }, box) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax
}

const TARGET_CITIES = [
  { name: 'Beijing', box: { latMin: 39.4, latMax: 40.2, lngMin: 115.5, lngMax: 117.5 } },
  { name: 'Hanoi', box: { latMin: 20.5, latMax: 21.8, lngMin: 104.2, lngMax: 106.2 } }
]

const CITY_TO_BOX = Object.fromEntries(TARGET_CITIES.map((c) => [c.name, c.box]))

const clusterI18nEn = {
  artworksCount: (n) => `${n} artworks`,
  cityCount: (city, n) => `${city} (${n})`,
  multipleArtists: 'Multiple artists',
  variousYears: 'Various years',
  multipleMuseums: 'Multiple museums',
  zoomExplore: (n) => `Zoom in to explore ${n} artworks in this area.`
}

const externalArtData = JSON.parse(
  await fs.readFile(new URL('../src/data/externalArtData.json', import.meta.url), 'utf8')
)

const allArtworksBase = normalizeArtworks([...(artworks || []), ...(easternArtData || []), ...(externalArtData || [])])
const allArtworks = allArtworksBase.map((a) => localizeArtworkDisplay(a, 'en'))
const jitteredArtworks = spreadOutArtworks(allArtworks)

const scenarios = [
  { band: 'far', altitude: 3.0 },
  { band: 'mid', altitude: 1.8 },
  { band: 'near', altitude: 0.9 }
]

const mismatches = []

for (const { band, altitude } of scenarios) {
  const markers = resolveLodData(jitteredArtworks, altitude, 80, clusterI18nEn)
  const candidates = markers.filter((m) => {
    const expectedCity = m?.isCluster
      ? parseCityFromClusterTitle(m?.title)
      : (m?.displayCity ?? m?.current_location?.city ?? '')
    return expectedCity && Object.prototype.hasOwnProperty.call(CITY_TO_BOX, expectedCity)
  })

  for (const marker of candidates) {
    const expectedCity = marker?.isCluster
      ? parseCityFromClusterTitle(marker?.title)
      : (marker?.displayCity ?? marker?.current_location?.city ?? '')
    const box = CITY_TO_BOX[expectedCity]
    const ok = withinBox({ lat: marker.lat, lng: marker.lng }, box)
    if (!ok) {
      mismatches.push({
        band,
        altitude,
        expectedCity,
        isCluster: Boolean(marker?.isCluster),
        title: marker?.title ?? '',
        lat: marker?.lat,
        lng: marker?.lng
      })
    }
  }

  const countForBand = candidates.length
  const sample = candidates.find((m) => m?.isCluster)
  console.log(
    `[verify_city_label_vs_coords] ${band}: candidates=${countForBand}${
      sample ? ` sampleClusterTitle="${sample.title}"` : ''
    }`
  )
}

if (mismatches.length === 0) {
  console.log('[verify_city_label_vs_coords] PASS: Beijing/Hanoi labels align with marker coordinates in far/mid/near.')
  process.exitCode = 0
} else {
  console.log(`[verify_city_label_vs_coords] FAIL: found ${mismatches.length} mismatches:`)
  for (const mm of mismatches) {
    console.log(
      `- band=${mm.band} expected=${mm.expectedCity} isCluster=${mm.isCluster} title="${mm.title}" lat=${mm.lat} lng=${mm.lng}`
    )
  }
  process.exitCode = 1
}

