/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-enriched.json')
const EXTERNAL_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-validated.json')
const REPORT_DIR = path.resolve(process.cwd(), 'scripts/reports')
const REPORT_PATH = path.join(REPORT_DIR, 'wikiart-validation-report.json')
const MIN_OVERALL_CONFIDENCE = Number(process.env.WIKIART_MIN_OVERALL_CONFIDENCE ?? 0.62)
const MAX_PER_CITY = Number(process.env.WIKIART_MAX_PER_CITY ?? 120)

function classifyRegion(lat, lng) {
  if (lat >= 17 && lat <= 56 && lng >= 98 && lng <= 151) return 'East Asia'
  if (lat >= -48 && lat <= -10 && lng >= 110 && lng <= 180) return 'Oceania'
  if (lat >= -12 && lat <= 60 && lng >= 25 && lng <= 170) return 'Asia'
  if (lat >= -35 && lat <= 37 && lng >= -20 && lng <= 52) return 'Africa'
  if (lat >= 35 && lat <= 72 && lng >= -12 && lng <= 45) return 'Europe'
  if (lat >= -60 && lat <= 83 && lng >= -170 && lng <= -35) return 'Americas'
  return 'Other'
}

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function fingerprintRecord(item) {
  const lat = Number(item.lat)
  const lng = Number(item.lng)
  return [
    safeText(item.title).toLowerCase(),
    safeText(item.artist).toLowerCase(),
    safeText(item.museum || item.museumName).toLowerCase(),
    Number.isFinite(lat) ? lat.toFixed(3) : 'na',
    Number.isFinite(lng) ? lng.toFixed(3) : 'na'
  ].join('::')
}

async function main() {
  const [raw, externalRaw] = await Promise.all([fs.readFile(INPUT_PATH, 'utf8'), fs.readFile(EXTERNAL_PATH, 'utf8')])
  const parsed = JSON.parse(raw)
  const records = Array.isArray(parsed?.records) ? parsed.records : []
  if (!records.length) throw new Error('No enriched WikiArt records. Run wikiart:enrich first.')

  const external = JSON.parse(externalRaw)
  if (!Array.isArray(external)) throw new Error('externalArtData.json must be an array')

  const fingerprintSeen = new Set(external.map((item) => fingerprintRecord(item)))

  const cityCounts = new Map()
  const accepted = []
  const rejected = []
  const regionCounts = {}

  for (const item of records) {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    const city = safeText(item.city)
    const museum = safeText(item.museum)
    const overall = Number(item?.confidence?.overall)
    let reason = ''

    if (!isValidLatLng(lat, lng)) reason = 'invalid_lat_lng'
    else if (!city) reason = 'missing_city'
    else if (!museum) reason = 'missing_museum'
    else if (!Number.isFinite(overall) || overall < MIN_OVERALL_CONFIDENCE) reason = 'low_confidence'

    const fp = !reason ? fingerprintRecord(item) : ''
    if (!reason && fingerprintSeen.has(fp)) reason = 'duplicate_fingerprint'

    const cityKey = city.toLowerCase()
    const cityCount = cityCounts.get(cityKey) ?? 0
    if (!reason && cityCount >= MAX_PER_CITY) reason = 'city_cap_exceeded'

    if (reason) {
      rejected.push({
        candidateId: item.candidateId,
        artist: item.artist,
        title: item.title,
        reason
      })
      continue
    }

    cityCounts.set(cityKey, cityCount + 1)
    fingerprintSeen.add(fp)
    const region = classifyRegion(lat, lng)
    regionCounts[region] = (regionCounts[region] ?? 0) + 1
    accepted.push({
      ...item,
      lat,
      lng,
      region
    })
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minOverallConfidence: MIN_OVERALL_CONFIDENCE,
        maxPerCity: MAX_PER_CITY,
        inputCount: records.length,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        regionCounts,
        accepted,
        rejected
      },
      null,
      2
    ),
    'utf8'
  )

  const reasonCounts = rejected.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1
    return acc
  }, {})
  await fs.mkdir(REPORT_DIR, { recursive: true })
  await fs.writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputCount: records.length,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        reasonCounts,
        regionCounts,
        sampleRejected: rejected.slice(0, 30)
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`WikiArt validation: accepted ${accepted.length}, rejected ${rejected.length}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
