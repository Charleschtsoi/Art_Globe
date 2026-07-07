/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const EXTERNAL_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const DEFAULT_INPUT = path.resolve(process.cwd(), 'tmp/kaggle2-validated.json')
const REPORT_PATH = path.resolve(process.cwd(), 'scripts/reports/kaggle2-merge-report.json')

/** Archive-2 has no bundled images in the enrich step; use a public SVG so normalizeArtwork keeps rows. */
const PLACEHOLDER_IMAGE_URL =
  String(process.env.KAGGLE2_PLACEHOLDER_IMAGE_URL ?? '').trim() || '/artworks/external/external-unavailable.svg'

/** Default 3000: archive-2 rows use placeholder images; cap keeps globe usable (raise via env for more metadata-only pins). */
const MAX_MERGE_TOTAL = Number(process.env.KAGGLE2_MAX_MERGE_TOTAL ?? 3000)
const MAX_PER_ARTIST = Number(process.env.KAGGLE2_MAX_PER_ARTIST_MERGE ?? 20)

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function isLikelyHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
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
    const museum = safeText(item.museum || item.museumName)
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

function toExternalRow(item) {
  const imageUrl = safeText(item.imageUrl) || PLACEHOLDER_IMAGE_URL
  return {
    id: safeText(item.candidateId || item.id),
    title: item.title,
    artist: item.artist,
    lat: Number(item.lat),
    lng: Number(item.lng),
    museum: item.museum,
    museumName: item.museumName ?? item.museum,
    description: item.description,
    medium: item.medium,
    imageUrl,
    canonicalImageUrl: safeText(item.canonicalImageUrl) || imageUrl,
    year: item.year ?? 'Unknown',
    priority: item.priority ?? 3,
    source: 'kaggle2',
    sourceUrl: '',
    time_period: item.time_period,
    current_location: {
      museum: item.museum || item.museumName,
      city: item.city,
      country: item.country,
      lat: Number(item.lat),
      lng: Number(item.lng)
    },
    assets: {
      thumbnail_url: imageUrl,
      high_res_url: imageUrl
    },
    confidence: item.confidence,
    metadata: item.metadata
  }
}

async function resolveInputPath() {
  const explicit = process.env.KAGGLE2_MERGE_INPUT
  if (explicit) {
    const p = path.resolve(process.cwd(), explicit)
    try {
      await fs.access(p)
      return p
    } catch {
      throw new Error(`KAGGLE2_MERGE_INPUT file not found: ${p}`)
    }
  }
  try {
    await fs.access(DEFAULT_INPUT)
    return DEFAULT_INPUT
  } catch {
    throw new Error(
      `No merge input. Run kaggle2:validate first or set KAGGLE2_MERGE_INPUT. Expected ${path.relative(process.cwd(), DEFAULT_INPUT)}`
    )
  }
}

async function main() {
  const inputPath = await resolveInputPath()
  const [inputRaw, externalRaw] = await Promise.all([fs.readFile(inputPath, 'utf8'), fs.readFile(EXTERNAL_PATH, 'utf8')])
  const payload = JSON.parse(inputRaw)
  const rawAccepted = Array.isArray(payload?.accepted) ? payload.accepted : []
  const external = JSON.parse(externalRaw)
  if (!Array.isArray(external)) throw new Error('externalArtData.json must be an array')
  if (!rawAccepted.length) throw new Error(`No accepted records in ${path.relative(process.cwd(), inputPath)}`)

  const incoming = rawAccepted.map((item) => ({
    ...item,
    imageUrl: safeText(item.imageUrl) || PLACEHOLDER_IMAGE_URL,
    canonicalImageUrl: safeText(item.canonicalImageUrl) || PLACEHOLDER_IMAGE_URL
  }))

  const quality = validateIncomingQuality(incoming)
  const existingFingerprints = new Set(external.map((item) => fingerprintRecord(item)))
  const existingIds = new Set(external.map((item) => safeText(item.id)).filter(Boolean))
  const artistCounts = new Map()
  const selected = []
  const skipped = []

  const ranked = [...quality.accepted].sort(
    (a, b) => Number(b?.confidence?.overall ?? 0) - Number(a?.confidence?.overall ?? 0)
  )

  for (const item of ranked) {
    if (selected.length >= MAX_MERGE_TOTAL) {
      skipped.push({ id: item.candidateId, reason: 'max_merge_total' })
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
    const incomingId = safeText(item.candidateId || item.id)
    if (incomingId && existingIds.has(incomingId)) {
      skipped.push({ id: item.candidateId, reason: 'duplicate_id' })
      continue
    }
    const row = toExternalRow(item)
    selected.push(row)
    existingFingerprints.add(fp)
    if (incomingId) existingIds.add(incomingId)
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
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        placeholderImageUrl: PLACEHOLDER_IMAGE_URL,
        inputFile: path.relative(process.cwd(), inputPath),
        incomingAccepted: rawAccepted.length,
        qualityAccepted: quality.accepted.length,
        qualityRejected: quality.rejected.length,
        importedCount: selected.length,
        skippedCount: skipped.length,
        maxMergeTotal: MAX_MERGE_TOTAL,
        maxPerArtist: MAX_PER_ARTIST,
        skippedReasonCounts: reasonCounts
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Kaggle2 merge complete. Imported: ${selected.length}, skipped: ${skipped.length}`)
  console.log(`Placeholder image: ${PLACEHOLDER_IMAGE_URL}`)
  console.log(`Updated: ${path.relative(process.cwd(), EXTERNAL_PATH)}`)
  console.log(`Report: ${path.relative(process.cwd(), REPORT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
