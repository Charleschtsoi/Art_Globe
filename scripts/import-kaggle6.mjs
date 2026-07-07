/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const KAGGLE6_ROOT = process.env.KAGGLE6_ROOT
  ? path.resolve(process.env.KAGGLE6_ROOT)
  : path.resolve(process.cwd(), 'kaggle sources/archive-6')
const CLASSES_CSV = path.join(KAGGLE6_ROOT, 'classes.csv')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-candidates.json')
// Full runs: default 15000. Smoke test: KAGGLE6_SMOKE=1 caps at 50 (override with KAGGLE6_MAX_CANDIDATES).
const SMOKE = ['1', 'true', 'yes'].includes(String(process.env.KAGGLE6_SMOKE ?? '').toLowerCase())
const DEFAULT_MAX_CANDIDATES = SMOKE ? 50 : 15000
const MAX_CANDIDATES = Number(process.env.KAGGLE6_MAX_CANDIDATES ?? DEFAULT_MAX_CANDIDATES)
const MAX_PER_ARTIST = Number(process.env.KAGGLE6_MAX_PER_ARTIST_IMPORT ?? 20)

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function stableId(parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
  return `kaggle6-${h}`
}

function humanizeSlug(slug) {
  const s = String(slug ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim()
  if (!s) return ''
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

async function main() {
  const csvRaw = await fs.readFile(CLASSES_CSV, 'utf8')
  const lines = csvRaw.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) throw new Error(`classes.csv is empty: ${CLASSES_CSV}`)
  const headers = parseCsvLine(lines[0]).map((h) => safeText(h).toLowerCase())
  const idx = {
    filename: headers.indexOf('filename'),
    artist: headers.indexOf('artist'),
    genre: headers.indexOf('genre'),
    description: headers.indexOf('description')
  }
  if (idx.filename < 0 || idx.artist < 0) {
    throw new Error('classes.csv must contain filename and artist columns')
  }

  const artistCounts = new Map()
  const candidates = []
  let missingImage = 0

  for (let i = 1; i < lines.length; i += 1) {
    if (candidates.length >= MAX_CANDIDATES) break
    const row = parseCsvLine(lines[i])
    const rel = safeText(row[idx.filename])
    const artistRaw = safeText(row[idx.artist])
    if (!rel || !artistRaw) continue
    const artist = humanizeSlug(artistRaw)
    if (!artist) continue
    const seen = artistCounts.get(artist) ?? 0
    if (seen >= MAX_PER_ARTIST) continue

    const imagePath = path.join(KAGGLE6_ROOT, rel)
    try {
      await fs.access(imagePath)
    } catch {
      missingImage += 1
      continue
    }

    const relParts = rel.split(/[\\/]/).filter(Boolean)
    const styleFolder = relParts[0] || ''
    const styleRaw = safeText(row[idx.genre]).replace(/[[\]']/g, '')
    const style = humanizeSlug(styleRaw || styleFolder) || 'Unknown style'
    const desc = safeText(row[idx.description])
    const title = humanizeSlug(desc || path.basename(rel, path.extname(rel))) || `${artist} work`
    const candidateId = stableId([rel, artistRaw, styleRaw, title])

    candidates.push({
      candidateId,
      source: 'kaggle6',
      artist,
      artistSlug: artistRaw.replace(/\s+/g, '-').toLowerCase(),
      style,
      title,
      localImagePath: imagePath,
      relativePath: rel,
      styleFolder,
      metadata: {
        subset: safeText(row[headers.indexOf('subset')], ''),
        phash: safeText(row[headers.indexOf('phash')], '')
      }
    })
    artistCounts.set(artist, seen + 1)
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceRoot: KAGGLE6_ROOT,
        inputCsv: CLASSES_CSV,
        smoke: SMOKE,
        maxCandidates: MAX_CANDIDATES,
        maxPerArtist: MAX_PER_ARTIST,
        scannedRows: lines.length - 1,
        candidateCount: candidates.length,
        missingImage,
        candidates
      },
      null,
      2
    ),
    'utf8'
  )

  const mode = SMOKE ? 'smoke (max ' + MAX_CANDIDATES + ')' : 'full'
  console.log(`kaggle6 import complete [${mode}]: ${candidates.length} candidates (missing images: ${missingImage})`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

