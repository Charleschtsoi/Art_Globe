/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const KAGGLE2_ROOT = process.env.KAGGLE2_ROOT
  ? path.resolve(process.env.KAGGLE2_ROOT)
  : path.resolve(process.cwd(), 'kaggle sources/archive-2')
const ARTISTS_CSV = path.join(KAGGLE2_ROOT, 'artists.csv')
const ARTWORKS_CSV = path.join(KAGGLE2_ROOT, 'artworks.csv')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle2-candidates.json')
const MAX_CANDIDATES = Number(process.env.KAGGLE2_MAX_CANDIDATES ?? 10000)
const MAX_PER_ARTIST = Number(process.env.KAGGLE2_MAX_PER_ARTIST_IMPORT ?? 20)

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function stableId(parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
  return `kaggle2-${h}`
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

function parseCsvRows(raw) {
  return raw.split(/\r?\n/).filter(Boolean).map(parseCsvLine)
}

async function main() {
  const [artistsRaw, artworksRaw] = await Promise.all([fs.readFile(ARTISTS_CSV, 'utf8'), fs.readFile(ARTWORKS_CSV, 'utf8')])
  const artistsRows = parseCsvRows(artistsRaw)
  const artworksRows = parseCsvRows(artworksRaw)
  if (artistsRows.length < 2 || artworksRows.length < 2) throw new Error('archive-2 CSVs are empty')

  const artistHeaders = artistsRows[0].map((h) => safeText(h).toLowerCase())
  const artistIdIdx = artistHeaders.indexOf('artist id')
  const artistNameIdx = artistHeaders.indexOf('name')
  const nationalityIdx = artistHeaders.indexOf('nationality')
  const byArtistId = new Map()
  for (let i = 1; i < artistsRows.length; i += 1) {
    const row = artistsRows[i]
    const id = safeText(row[artistIdIdx])
    if (!id) continue
    byArtistId.set(id, {
      name: safeText(row[artistNameIdx]),
      nationality: safeText(row[nationalityIdx])
    })
  }

  const headers = artworksRows[0].map((h) => safeText(h).toLowerCase())
  const iArtworkId = headers.indexOf('artwork id')
  const iTitle = headers.indexOf('title')
  const iArtistId = headers.indexOf('artist id')
  const iName = headers.indexOf('name')
  const iDate = headers.indexOf('date')
  const iMedium = headers.indexOf('medium')
  const iDept = headers.indexOf('department')
  const iClass = headers.indexOf('classification')

  const artistCounts = new Map()
  const candidates = []
  for (let i = 1; i < artworksRows.length; i += 1) {
    if (candidates.length >= MAX_CANDIDATES) break
    const row = artworksRows[i]
    const artistId = safeText(row[iArtistId])
    const artistMeta = byArtistId.get(artistId)
    const artist = safeText(row[iName] || artistMeta?.name)
    if (!artist) continue
    const seen = artistCounts.get(artist) ?? 0
    if (seen >= MAX_PER_ARTIST) continue

    const title = safeText(row[iTitle], 'Untitled')
    const candidateId = stableId([safeText(row[iArtworkId]), title, artist])
    candidates.push({
      candidateId,
      source: 'kaggle2',
      title,
      artist,
      artistId,
      yearText: safeText(row[iDate]),
      medium: safeText(row[iMedium]),
      department: safeText(row[iDept]),
      classification: safeText(row[iClass]),
      nationality: safeText(artistMeta?.nationality),
      museum: 'Museum of Modern Art',
      hasLocalImage: false,
      localImagePath: '',
      metadata: {
        artworkId: safeText(row[iArtworkId])
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
        artistsCount: byArtistId.size,
        scannedRows: artworksRows.length - 1,
        maxCandidates: MAX_CANDIDATES,
        maxPerArtist: MAX_PER_ARTIST,
        candidateCount: candidates.length,
        candidates
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`kaggle2 import complete: ${candidates.length} candidates`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

