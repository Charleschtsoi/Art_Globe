/* global process */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT_ARG = process.argv[2] ?? 'tmp/kaggle6-uploaded.json'
const RECORDS_KEY_ARG = process.argv[3] ?? 'records'
const INPUT_PATH = path.resolve(process.cwd(), INPUT_ARG)
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/supabase-upsert-report.json')
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_TABLE = process.env.SUPABASE_ARTWORKS_TABLE ?? 'artworks'
const BATCH_SIZE = Number(process.env.SUPABASE_UPSERT_BATCH_SIZE ?? 500)
const DRY_RUN = String(process.env.SUPABASE_DRY_RUN ?? '').toLowerCase() === 'true'

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function pickRecordRows(payload, key) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload[key])) return payload[key]
  return []
}

function canonicalFingerprint(item) {
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

function mapRow(item, rowIndex) {
  return {
    source_id: safeText(item.candidateId || item.id || `${item.source || 'src'}-${rowIndex}`),
    title: safeText(item.title, 'Untitled'),
    artist: safeText(item.artist, 'Unknown Artist'),
    museum_name: safeText(item.museum || item.museumName, 'Unknown Museum'),
    city: safeText(item.city),
    country: safeText(item.country),
    lat: Number.isFinite(Number(item.lat)) ? Number(item.lat) : null,
    lng: Number.isFinite(Number(item.lng)) ? Number(item.lng) : null,
    time_period: safeText(item.time_period || item.timePeriod || 'modern'),
    source: safeText(item.source, 'unknown'),
    medium: safeText(item.medium || item.metadata?.style, ''),
    year_text: safeText(item.year_text || item.year, ''),
    image_url: safeText(item.imageUrl),
    canonical_fingerprint: canonicalFingerprint(item),
    confidence: Number.isFinite(Number(item?.confidence?.overall)) ? Number(item.confidence.overall) : null
  }
}

async function upsertBatch(rows) {
  if (DRY_RUN) return
  const endpoint = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=canonical_fingerprint`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase upsert failed (${response.status}): ${text.slice(0, 220)}`)
  }
}

async function main() {
  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  }
  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const payload = JSON.parse(raw)
  const records = pickRecordRows(payload, RECORDS_KEY_ARG)
  if (!records.length) throw new Error(`No records found in ${INPUT_ARG} using key "${RECORDS_KEY_ARG}"`)

  const rows = records.map(mapRow).filter((row) => row.city && Number.isFinite(row.lat) && Number.isFinite(row.lng))
  let processed = 0
  let batchCount = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await upsertBatch(batch)
    processed += batch.length
    batchCount += 1
    console.log(`Supabase upsert ${processed}/${rows.length}`)
  }

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputPath: INPUT_ARG,
        recordsKey: RECORDS_KEY_ARG,
        inputRecords: records.length,
        upsertRows: rows.length,
        dryRun: DRY_RUN,
        batchSize: BATCH_SIZE,
        batchCount
      },
      null,
      2
    ),
    'utf8'
  )
  console.log(`Supabase upsert complete. Rows=${rows.length} batches=${batchCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

