/* global process */
/**
 * Rewrites public/data chunk JSON + search-index so clones without pipeline images still show thumbs:
 * 1) Prefer direct HTTPS image URLs already on the record.
 * 2) Keep bundled local paths (builtin art-*.jpg + curated eastern asia/* files).
 * 3) Otherwise assign a deterministic Wikimedia Commons thumb per city (see ossFallbackThumbnails).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworks, easternArtData } from '../src/artData.js'
import { getOssFallbackThumbForCity } from '../src/constants/ossFallbackThumbnails.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const chunksDir = path.resolve(projectRoot, 'public/data/chunks')
const searchIndexPath = path.resolve(projectRoot, 'public/data/search-index.json')

const imgRe = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i

function isDirectHttpImage(u) {
  if (!u || typeof u !== 'string' || !u.startsWith('http')) return false
  if (imgRe.test(u)) return true
  if (u.includes('Special:FilePath')) return true
  if (/\/media\//i.test(u)) return true
  return false
}

function bundledLocalPaths() {
  const set = new Set()
  for (const a of artworks ?? []) {
    const u = a.imageUrl
    if (u && u.startsWith('/')) set.add(u)
  }
  for (const e of easternArtData ?? []) {
    const u = e.imageUrl
    if (u && u.startsWith('/')) set.add(u)
  }
  return set
}

const BUNDLED = bundledLocalPaths()

function cityFrom(rec) {
  return String(rec.current_location?.city ?? rec.city ?? '').trim()
}

function resolveThumb(rec) {
  const canon = rec.canonicalImageUrl ?? ''
  const img = rec.imageUrl ?? ''
  if (isDirectHttpImage(canon)) return canon
  if (isDirectHttpImage(img)) return img
  if (img.startsWith('/') && BUNDLED.has(img)) return img
  return getOssFallbackThumbForCity(cityFrom(rec))
}

function applyToRecord(rec) {
  const url = resolveThumb(rec)
  rec.imageUrl = url
  rec.canonicalImageUrl = url
  if (rec.assets) {
    rec.assets.thumbnail_url = url
    rec.assets.high_res_url = url
  }
  return rec
}

async function main() {
  const entries = await fs.readdir(chunksDir, { withFileTypes: true })
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.json') || ent.name === 'manifest.json') continue
    const abs = path.join(chunksDir, ent.name)
    const raw = await fs.readFile(abs, 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data.records)) continue
    for (const rec of data.records) applyToRecord(rec)
    await fs.writeFile(abs, JSON.stringify(data, null, 2), 'utf8')
    console.log('updated', path.relative(projectRoot, abs))
  }

  const siRaw = await fs.readFile(searchIndexPath, 'utf8')
  const si = JSON.parse(siRaw)
  if (Array.isArray(si.records)) {
    for (const rec of si.records) {
      const url = resolveThumb(rec)
      rec.imageUrl = url
      rec.canonicalImageUrl = url
    }
  }
  await fs.writeFile(searchIndexPath, JSON.stringify(si, null, 2), 'utf8')
  console.log('updated', path.relative(projectRoot, searchIndexPath))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
