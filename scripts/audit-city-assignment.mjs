/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import { artworks, easternArtData } from '../src/artData.js'
import { normalizeArtworks } from '../src/services/normalizeArtwork.js'
import { localizeArtworkDisplay } from '../src/i18n/localizeArtworkDisplay.js'
import { getCityForMuseum } from '../src/constants/museumCities.js'

const REPORT_DIR = path.resolve(process.cwd(), 'scripts/reports')
const REPORT_PATH = path.join(REPORT_DIR, 'city-audit-report.json')
const EXTERNAL_DATA_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')

const toRad = (deg) => (deg * Math.PI) / 180
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(aa))
}

function avgCoord(list) {
  if (!list.length) return null
  const sum = list.reduce((acc, it) => ({ lat: acc.lat + it.lat, lng: acc.lng + it.lng }), { lat: 0, lng: 0 })
  return { lat: sum.lat / list.length, lng: sum.lng / list.length }
}

async function main() {
  const externalRaw = await fs.readFile(EXTERNAL_DATA_PATH, 'utf8')
  const externalData = JSON.parse(externalRaw)
  const normalized = normalizeArtworks([...(artworks || []), ...(easternArtData || []), ...(externalData || [])])
  const all = normalized.map((a) => localizeArtworkDisplay(a, 'en'))

  const byMuseum = new Map()
  for (const art of all) {
    const museum = String(art.museumName ?? art.current_location?.museum ?? '').trim()
    if (!museum) continue
    if (!byMuseum.has(museum)) byMuseum.set(museum, [])
    byMuseum.get(museum).push(art)
  }

  const cityToCoords = new Map()
  for (const [museum, items] of byMuseum.entries()) {
    const city = getCityForMuseum(museum, 'en')
    if (!city) continue
    const coords = items
      .map((it) => ({ lat: Number(it.lat), lng: Number(it.lng) }))
      .filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lng))
    if (!coords.length) continue
    if (!cityToCoords.has(city)) cityToCoords.set(city, [])
    cityToCoords.get(city).push(...coords)
  }

  const cityCentroids = [...cityToCoords.entries()]
    .map(([city, coords]) => ({ city, count: coords.length, centroid: avgCoord(coords) }))
    .filter((x) => x.centroid && x.count >= 2)

  const mismatches = []
  for (const [museum, items] of byMuseum.entries()) {
    const expectedCity = getCityForMuseum(museum, 'en')
    if (!expectedCity) continue
    const coords = items
      .map((it) => ({ lat: Number(it.lat), lng: Number(it.lng), id: it.id, title: it.title }))
      .filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lng))
    if (!coords.length) continue
    const museumCentroid = avgCoord(coords)
    const expectedCentroid = cityCentroids.find((c) => c.city === expectedCity)?.centroid
    if (!expectedCentroid) continue

    const expectedDistKm = haversineKm(
      museumCentroid.lat,
      museumCentroid.lng,
      expectedCentroid.lat,
      expectedCentroid.lng
    )
    const nearest = cityCentroids
      .map((c) => ({
        city: c.city,
        distKm: haversineKm(museumCentroid.lat, museumCentroid.lng, c.centroid.lat, c.centroid.lng)
      }))
      .sort((a, b) => a.distKm - b.distKm)[0]

    const confidentMismatch =
      nearest &&
      nearest.city !== expectedCity &&
      nearest.distKm < 180 &&
      expectedDistKm - nearest.distKm > 120

    if (confidentMismatch) {
      mismatches.push({
        museum,
        expectedCity,
        suggestedCity: nearest.city,
        museumCentroid,
        expectedDistKm: Number(expectedDistKm.toFixed(1)),
        nearestDistKm: Number(nearest.distKm.toFixed(1)),
        sample: coords.slice(0, 3)
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalArtworks: all.length,
    totalMuseums: byMuseum.size,
    cityCentroidCount: cityCentroids.length,
    mismatchCount: mismatches.length,
    mismatches: mismatches.sort((a, b) => b.expectedDistKm - a.expectedDistKm)
  }

  await fs.mkdir(REPORT_DIR, { recursive: true })
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log(`City audit complete. Artworks: ${report.totalArtworks}, museums: ${report.totalMuseums}`)
  console.log(`Potential high-confidence mismatches: ${report.mismatchCount}`)
  mismatches.slice(0, 20).forEach((m) => {
    console.log(
      ` - ${m.museum}: expected ${m.expectedCity}, suggested ${m.suggestedCity} (expected ${m.expectedDistKm}km, nearest ${m.nearestDistKm}km)`
    )
  })
  console.log(`Report written: ${path.relative(process.cwd(), REPORT_PATH)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

