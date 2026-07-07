/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-uploaded.json')
const EXTERNAL_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const REPORT_PATH = path.resolve(process.cwd(), 'scripts/reports/wikiart-merge-report.json')
const QUALITY_REPORT_PATH = path.resolve(process.cwd(), 'scripts/reports/wikiart-quality-report.json')
const MIN_APAC_SHARE = Number(process.env.MIN_APAC_SHARE ?? 0.45)
const MIN_AFRICA_SHARE = Number(process.env.MIN_AFRICA_SHARE ?? 0.05)
const MAX_PER_ARTIST = Number(process.env.WIKIART_MAX_PER_ARTIST_MERGE ?? 10)
const MAX_IMPORT_TOTAL = Number(process.env.WIKIART_MAX_IMPORT_TOTAL ?? 800)

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function classifyRegion(lat, lng) {
  if (lat >= 17 && lat <= 56 && lng >= 98 && lng <= 151) return 'East Asia'
  if (lat >= -48 && lat <= -10 && lng >= 110 && lng <= 180) return 'Oceania'
  if (lat >= -12 && lat <= 60 && lng >= 25 && lng <= 170) return 'Asia'
  if (lat >= -35 && lat <= 37 && lng >= -20 && lng <= 52) return 'Africa'
  if (lat >= 35 && lat <= 72 && lng >= -12 && lng <= 45) return 'Europe'
  if (lat >= -60 && lat <= 83 && lng >= -170 && lng <= -35) return 'Americas'
  return 'Other'
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

function regionCountsFor(items) {
  const counts = {
    'East Asia': 0,
    Asia: 0,
    Oceania: 0,
    Africa: 0,
    Europe: 0,
    Americas: 0,
    Other: 0
  }
  for (const item of items) {
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const region = classifyRegion(lat, lng)
    counts[region] = (counts[region] ?? 0) + 1
  }
  return counts
}

function canKeepBalance(existingCounts, selectedCounts, nextRegion) {
  const next = { ...selectedCounts, [nextRegion]: (selectedCounts[nextRegion] ?? 0) + 1 }
  const baseTotal = Object.values(existingCounts).reduce((sum, n) => sum + n, 0)
  const addTotal = Object.values(next).reduce((sum, n) => sum + n, 0)
  const finalTotal = baseTotal + addTotal
  const finalApac =
    existingCounts['East Asia'] +
    existingCounts.Asia +
    existingCounts.Oceania +
    next['East Asia'] +
    next.Asia +
    next.Oceania
  const finalAfrica = existingCounts.Africa + next.Africa
  return finalApac / finalTotal >= MIN_APAC_SHARE && finalAfrica / finalTotal >= MIN_AFRICA_SHARE
}

function isLikelyHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

function validateIncomingQuality(incoming) {
  const accepted = []
  const rejected = []
  const duplicateIds = new Set()
  const seenIds = new Set()
  for (const item of incoming) {
    const id = safeText(item.candidateId || item.id)
    const lat = Number(item.lat)
    const lng = Number(item.lng)
    const title = safeText(item.title)
    const artist = safeText(item.artist)
    const museum = safeText(item.museum)
    const imageUrl = safeText(item.imageUrl)
    const issues = []

    if (!id) issues.push('missing_id')
    if (!title) issues.push('missing_title')
    if (!artist) issues.push('missing_artist')
    if (!museum) issues.push('missing_museum')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) issues.push('invalid_coords')
    if (!isLikelyHttpUrl(imageUrl) && !imageUrl.startsWith('/')) issues.push('invalid_image_url')

    if (id) {
      if (seenIds.has(id)) {
        issues.push('duplicate_incoming_id')
        duplicateIds.add(id)
      } else {
        seenIds.add(id)
      }
    }

    if (issues.length) rejected.push({ id, issues })
    else accepted.push(item)
  }
  return { accepted, rejected, duplicateIncomingIds: [...duplicateIds] }
}

async function main() {
  const [inputRaw, externalRaw] = await Promise.all([fs.readFile(INPUT_PATH, 'utf8'), fs.readFile(EXTERNAL_PATH, 'utf8')])
  const uploaded = JSON.parse(inputRaw)
  const incoming = Array.isArray(uploaded?.records) ? uploaded.records : []
  const external = JSON.parse(externalRaw)
  if (!Array.isArray(external)) throw new Error('externalArtData.json must be an array')
  const quality = validateIncomingQuality(incoming)

  const existingFingerprints = new Set(external.map((item) => fingerprintRecord(item)))
  const existingRegionCounts = regionCountsFor(external)

  const artistCounts = new Map()
  const selectedCounts = {
    'East Asia': 0,
    Asia: 0,
    Oceania: 0,
    Africa: 0,
    Europe: 0,
    Americas: 0,
    Other: 0
  }
  const selected = []
  const skipped = []

  const ranked = [...quality.accepted]
    .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)))
    .sort((a, b) => Number(b?.confidence?.overall ?? 0) - Number(a?.confidence?.overall ?? 0))

  for (const item of ranked) {
    if (selected.length >= MAX_IMPORT_TOTAL) {
      skipped.push({ id: item.candidateId, reason: 'max_import_total' })
      continue
    }
    const artistKey = safeText(item.artist).toLowerCase()
    const seenArtist = artistCounts.get(artistKey) ?? 0
    if (seenArtist >= MAX_PER_ARTIST) {
      skipped.push({ id: item.candidateId, reason: 'artist_cap' })
      continue
    }
    const fp = fingerprintRecord(item)
    if (existingFingerprints.has(fp)) {
      skipped.push({ id: item.candidateId, reason: 'duplicate_fingerprint' })
      continue
    }
    const region = classifyRegion(Number(item.lat), Number(item.lng))
    if (!canKeepBalance(existingRegionCounts, selectedCounts, region)) {
      skipped.push({ id: item.candidateId, reason: 'region_balance_guard' })
      continue
    }
    selected.push({
      id: item.candidateId,
      title: item.title,
      artist: item.artist,
      lat: Number(item.lat),
      lng: Number(item.lng),
      museum: item.museum,
      museumName: item.museum,
      description: item.description,
      imageUrl: item.imageUrl,
      canonicalImageUrl: item.canonicalImageUrl ?? item.imageUrl,
      year: item.year,
      priority: item.priority ?? 4,
      source: 'wikiart',
      sourceUrl: item.metadata?.artistWikipedia ?? '',
      current_location: {
        museum: item.museum,
        city: item.city,
        country: item.country,
        lat: Number(item.lat),
        lng: Number(item.lng)
      },
      assets: {
        thumbnail_url: item.imageUrl,
        high_res_url: item.imageUrl
      }
    })
    existingFingerprints.add(fp)
    selectedCounts[region] = (selectedCounts[region] ?? 0) + 1
    artistCounts.set(artistKey, seenArtist + 1)
  }

  const merged = [...external, ...selected]
  await fs.writeFile(EXTERNAL_PATH, JSON.stringify(merged, null, 2), 'utf8')

  const reasonCounts = skipped.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1
    return acc
  }, {})
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(
    QUALITY_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        incomingCount: incoming.length,
        qualityAcceptedCount: quality.accepted.length,
        qualityRejectedCount: quality.rejected.length,
        duplicateIncomingIds: quality.duplicateIncomingIds,
        rejected: quality.rejected
      },
      null,
      2
    ),
    'utf8'
  )
  await fs.writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        incomingCount: quality.accepted.length,
        importedCount: selected.length,
        skippedCount: skipped.length,
        maxPerArtist: MAX_PER_ARTIST,
        maxImportTotal: MAX_IMPORT_TOTAL,
        selectedRegionCounts: selectedCounts,
        skippedReasonCounts: reasonCounts
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`WikiArt merge complete. Imported: ${selected.length}, skipped: ${skipped.length}`)
  console.log(`Updated: ${path.relative(process.cwd(), EXTERNAL_PATH)}`)
  console.log(`Quality report: ${path.relative(process.cwd(), QUALITY_REPORT_PATH)}`)
  console.log(`Report: ${path.relative(process.cwd(), REPORT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
