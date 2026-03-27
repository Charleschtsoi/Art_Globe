/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const WIKIART_ROOT = process.env.WIKIART_ROOT ? path.resolve(process.env.WIKIART_ROOT) : ''
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/wikiart-candidates.json')
const MAX_CANDIDATES = Number(process.env.WIKIART_MAX_CANDIDATES ?? 8000)
const MAX_PER_ARTIST = Number(process.env.WIKIART_MAX_PER_ARTIST_IMPORT ?? 15)

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function humanizeSlug(slug) {
  const s = String(slug ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .trim()
  if (!s) return ''
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function stableId(parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
  return `wikiart-${h}`
}

async function collectImageFiles(rootDir) {
  /** @type {string[]} */
  const out = []
  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else {
        const ext = path.extname(ent.name).toLowerCase()
        if (IMAGE_EXT.has(ext)) out.push(full)
      }
    }
  }
  await walk(rootDir)
  return out
}

function parseRelative(rel) {
  const norm = rel.split(path.sep).filter(Boolean)
  if (norm.length >= 3) {
    const style = norm[0]
    const artistSlug = norm[1]
    const base = norm[norm.length - 1]
    return { style, artistSlug, base, depth: 'style-artist' }
  }
  if (norm.length === 2) {
    return { style: '', artistSlug: norm[0], base: norm[1], depth: 'artist' }
  }
  return { style: '', artistSlug: '', base: norm[0] || '', depth: 'flat' }
}

async function main() {
  if (!WIKIART_ROOT) {
    throw new Error('Set WIKIART_ROOT to the unpacked WikiArt dataset root directory.')
  }
  await fs.access(WIKIART_ROOT)

  const absFiles = await collectImageFiles(WIKIART_ROOT)
  const artistCounts = new Map()
  /** @type {object[]} */
  const candidates = []

  for (const abs of absFiles.sort()) {
    if (candidates.length >= MAX_CANDIDATES) break
    const rel = path.relative(WIKIART_ROOT, abs)
    const { style, artistSlug, base, depth } = parseRelative(rel)
    const artist = humanizeSlug(artistSlug || (depth === 'flat' ? path.dirname(rel) : ''))
    if (!artist) continue

    const seen = artistCounts.get(artist) ?? 0
    if (seen >= MAX_PER_ARTIST) continue

    const title = humanizeSlug(path.basename(base, path.extname(base))) || `${artist} work`
    const candidateId = stableId([style, artistSlug || artist, rel])

    candidates.push({
      candidateId,
      source: 'wikiart',
      artist,
      artistSlug: artistSlug || artist.replace(/\s+/g, '_').toLowerCase(),
      style: humanizeSlug(style) || 'Unknown style',
      title,
      localImagePath: abs,
      relativePath: rel,
      pathDepth: depth
    })

    artistCounts.set(artist, seen + 1)
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        wikiartRoot: WIKIART_ROOT,
        maxCandidates: MAX_CANDIDATES,
        maxPerArtist: MAX_PER_ARTIST,
        scannedFiles: absFiles.length,
        candidateCount: candidates.length,
        candidates
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`WikiArt import: ${candidates.length} candidates (scanned ${absFiles.length} images)`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
