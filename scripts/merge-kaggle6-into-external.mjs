/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const EXTERNAL_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const UPLOADED_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-uploaded.json')
const LOCAL_MERGE_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-local-for-merge.json')
const REPORT_PATH = path.resolve(process.cwd(), 'scripts/reports/kaggle6-merge-report.json')

/** Default 15000: full kaggle6 validate runs can exceed 10k accepted rows before dedupe. */
const MAX_MERGE_TOTAL = Number(process.env.KAGGLE6_MAX_MERGE_TOTAL ?? 15000)
const MAX_PER_ARTIST = Number(process.env.KAGGLE6_MAX_PER_ARTIST_MERGE ?? 20)

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
  const imageUrl = safeText(item.imageUrl)
  const wiki = safeText(item.metadata?.artistWikipedia)
  return {
    id: safeText(item.candidateId || item.id),
    title: item.title,
    artist: item.artist,
    lat: Number(item.lat),
    lng: Number(item.lng),
    museum: item.museum,
    museumName: item.museumName ?? item.museum,
    description: item.description,
    imageUrl,
    canonicalImageUrl: safeText(item.canonicalImageUrl) || imageUrl,
    year: item.year ?? 'Unknown',
    priority: item.priority ?? 4,
    source: 'kaggle6',
    sourceUrl: wiki,
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
  const explicit = process.env.KAGGLE6_MERGE_INPUT
  if (explicit) {
    const p = path.resolve(process.cwd(), explicit)
    try {
      await fs.access(p)
      return p
    } catch {
      throw new Error(`KAGGLE6_MERGE_INPUT file not found: ${p}`)
    }
  }
  /** Prefer local static merge output when present (full run); cloud upload file may be a small partial. */
  try {
    await fs.access(LOCAL_MERGE_PATH)
    return LOCAL_MERGE_PATH
  } catch {
    /* try uploaded */
  }
  try {
    await fs.access(UPLOADED_PATH)
    return UPLOADED_PATH
  } catch {
    throw new Error(
      `No merge input. Run kaggle6:local-images or kaggle6:upload, or set KAGGLE6_MERGE_INPUT. Expected ${path.relative(process.cwd(), LOCAL_MERGE_PATH)} or ${path.relative(process.cwd(), UPLOADED_PATH)}`
    )
  }
}

async function main() {
  const inputPath = await resolveInputPath()
  const [inputRaw, externalRaw] = await Promise.all([fs.readFile(inputPath, 'utf8'), fs.readFile(EXTERNAL_PATH, 'utf8')])
  const payload = JSON.parse(inputRaw)
  const incoming = Array.isArray(payload?.records) ? payload.records : []
  const external = JSON.parse(externalRaw)
  if (!Array.isArray(external)) throw new Error('externalArtData.json must be an array')
  if (!incoming.length) throw new Error(`No records in ${path.relative(process.cwd(), inputPath)}`)

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
        inputFile: path.relative(process.cwd(), inputPath),
        incomingCount: incoming.length,
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

  console.log(`Kaggle6 merge complete. Imported: ${selected.length}, skipped: ${skipped.length}`)
  console.log(`Updated: ${path.relative(process.cwd(), EXTERNAL_PATH)}`)
  console.log(`Report: ${path.relative(process.cwd(), REPORT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
