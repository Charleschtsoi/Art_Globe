/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'

const ARCHIVE_ROOT = path.resolve(process.env.ARCHIVE3_ROOT ?? '/Users/charlescht/Downloads/archive-3')
const ARTISTS_CSV = path.join(ARCHIVE_ROOT, 'artists.csv')
const RESIZED_DIR = path.join(ARCHIVE_ROOT, 'resized', 'resized')
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp')
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'archive3-candidates.json')
const MAX_PER_ARTIST = Number(process.env.ARCHIVE3_MAX_PER_ARTIST ?? 30)

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function splitCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((h) => safeText(h))
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    const row = {}
    headers.forEach((header, idx) => {
      row[header] = safeText(values[idx])
    })
    return row
  })
}

function slugify(text) {
  return safeText(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function inferArtistNameFromFile(fileName) {
  const stem = safeText(fileName).replace(/\.[^.]+$/, '')
  const match = stem.match(/^(.*)_(\d+)$/)
  if (!match) {
    return {
      artistFileKey: stem,
      seq: null
    }
  }
  return {
    artistFileKey: match[1],
    seq: Number(match[2])
  }
}

async function main() {
  const [csvRaw, resizedEntries] = await Promise.all([
    fs.readFile(ARTISTS_CSV, 'utf8'),
    fs.readdir(RESIZED_DIR)
  ])
  const artists = parseCsv(csvRaw)
  if (!artists.length) throw new Error('No artist rows parsed from archive-3 artists.csv')

  const byArtistSlug = new Map()
  artists.forEach((artist) => {
    const name = safeText(artist.name, 'Unknown Artist')
    byArtistSlug.set(slugify(name), {
      ...artist,
      artistName: name,
      artistSlug: slugify(name)
    })
  })

  const groupedFiles = new Map()
  for (const fileName of resizedEntries) {
    if (!/\.(jpe?g|png|webp)$/i.test(fileName)) continue
    const { artistFileKey, seq } = inferArtistNameFromFile(fileName)
    if (!artistFileKey) continue
    const artistSlug = slugify(artistFileKey.replace(/_/g, ' '))
    if (!groupedFiles.has(artistSlug)) groupedFiles.set(artistSlug, [])
    groupedFiles.get(artistSlug).push({
      fileName,
      seq: Number.isFinite(seq) ? seq : null
    })
  }

  const candidates = []
  let missingArtists = 0
  for (const [artistSlug, files] of groupedFiles.entries()) {
    const artist = byArtistSlug.get(artistSlug)
    if (!artist) {
      missingArtists += 1
      continue
    }
    const sorted = [...files].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
    const picked = sorted.slice(0, Math.max(1, MAX_PER_ARTIST))
    picked.forEach((entry, idx) => {
      const seq = entry.seq ?? idx + 1
      const localPath = path.join(RESIZED_DIR, entry.fileName)
      candidates.push({
        candidateId: `archive3-${artist.artistSlug}-${seq}`,
        source: 'archive3',
        artistId: safeText(artist.id),
        artist: artist.artistName,
        artistSlug: artist.artistSlug,
        years: safeText(artist.years),
        genre: safeText(artist.genre),
        nationality: safeText(artist.nationality),
        bio: safeText(artist.bio),
        wikipedia: safeText(artist.wikipedia),
        paintingsCount: Number(artist.paintings) || null,
        sequence: seq,
        localImagePath: localPath,
        fileName: entry.fileName
      })
    })
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        archiveRoot: ARCHIVE_ROOT,
        maxPerArtist: MAX_PER_ARTIST,
        sourceArtistRows: artists.length,
        candidateCount: candidates.length,
        unmatchedArtistFolderCount: missingArtists,
        candidates
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Archive-3 parsing complete. Candidates: ${candidates.length}`)
  console.log(`Unmatched artist folder groups: ${missingArtists}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
