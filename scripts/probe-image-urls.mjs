/* global process */
/**
 * Probe external image URL availability and write public/data/image-availability.json.
 *
 * Run: npm run data:probe-images
 * Env:
 *   PROBE_IMAGES_LIMIT=50        # smoke / partial runs
 *   PROBE_CONCURRENCY=20
 *   PROBE_REQUESTS_PER_HOST=8
 *   PROBE_SKIP_CACHE=1           # re-probe even when cache entry exists
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeArtworks } from '../src/services/normalizeArtwork.js'
import { artworks, easternArtData } from '../src/artData.js'
import {
  collectImageCandidates,
  isLikelyImageUrl,
  resizeImageUrl
} from './lib/imageResolver.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const externalPath = path.resolve(projectRoot, 'src/data/externalArtData.json')
const overridesPath = path.resolve(projectRoot, 'src/data/wikidata-image-overrides.json')
const availabilityPath = path.resolve(projectRoot, 'public/data/image-availability.json')

const LIMIT = Number(process.env.PROBE_IMAGES_LIMIT ?? 0)
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 20)
const PER_HOST_LIMIT = Number(process.env.PROBE_REQUESTS_PER_HOST ?? 8)
const SKIP_CACHE = String(process.env.PROBE_SKIP_CACHE ?? '').toLowerCase() === '1'
const USER_AGENT = 'ArtGlobeImageProbe/1.0 (educational project)'

const hostQueues = new Map()

async function throttleHost(host) {
  const now = Date.now()
  const state = hostQueues.get(host) ?? { active: 0, lastAt: 0 }
  while (state.active >= PER_HOST_LIMIT) {
    await new Promise((r) => setTimeout(r, 40))
  }
  const wait = Math.max(0, 120 - (now - state.lastAt))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  state.active += 1
  state.lastAt = Date.now()
  hostQueues.set(host, state)
  return () => {
    state.active = Math.max(0, state.active - 1)
  }
}

function isImageContentType(type) {
  const low = String(type ?? '').toLowerCase()
  if (!low) return true
  if (low.startsWith('image/')) return true
  if (low.includes('octet-stream')) return true
  return false
}

function isHtmlContentType(type) {
  const low = String(type ?? '').toLowerCase()
  return low.includes('text/html') || low.includes('application/xhtml')
}

async function probeUrl(url) {
  if (!isLikelyImageUrl(url)) {
    return { ok: false, status: 0, method: 'rejected' }
  }

  const sized = resizeImageUrl(url, 'thumb')
  let host = 'unknown'
  try {
    host = new URL(sized).host
  } catch {
    return { ok: false, status: 0, method: 'invalid' }
  }

  const release = await throttleHost(host)
  try {
    const head = await fetch(sized, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT }
    })
    if (head.ok) {
      const type = head.headers.get('content-type') || ''
      if (!isHtmlContentType(type) && isImageContentType(type)) {
        return { ok: true, status: head.status, method: 'HEAD' }
      }
    }

    const get = await fetch(sized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Range: 'bytes=0-511'
      }
    })
    const type = get.headers.get('content-type') || ''
    const ok = get.ok || get.status === 206
    return {
      ok: ok && !isHtmlContentType(type) && isImageContentType(type),
      status: get.status,
      method: 'GET'
    }
  } catch {
    return { ok: false, status: 0, method: 'error' }
  } finally {
    release()
  }
}

async function probeArtwork(art) {
  const id = String(art.id ?? art.artwork_id ?? '')
  const candidates = collectImageCandidates(art)
  const checkedAt = new Date().toISOString()

  if (candidates.length === 0) {
    return {
      id,
      availability: 'none',
      winningUrl: '',
      checkedAt,
      tried: []
    }
  }

  const tried = []
  for (const candidate of candidates) {
    const result = await probeUrl(candidate)
    tried.push({ url: candidate, ...result })
    if (result.ok) {
      return {
        id,
        availability: 'ok',
        winningUrl: candidate,
        checkedAt,
        tried
      }
    }
  }

  return {
    id,
    availability: 'broken',
    winningUrl: '',
    checkedAt,
    tried
  }
}

async function mapPool(items, worker) {
  const results = []
  let index = 0

  async function run() {
    while (index < items.length) {
      const i = index
      index += 1
      results[i] = await worker(items[i], i)
    }
  }

  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => run())
  await Promise.all(runners)
  return results
}

async function loadExistingCache() {
  try {
    const raw = await fs.readFile(availabilityPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {}
  } catch {
    return {}
  }
}

async function loadWikidataOverrides() {
  try {
    const raw = await fs.readFile(overridesPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function applyWikidataOverrides(items, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return items
  return items.map((art) => {
    const url = overrides[String(art.id ?? '')]
    if (!url) return art
    return { ...art, canonicalImageUrl: url, imageUrl: url }
  })
}

async function main() {
  const externalRaw = await fs.readFile(externalPath, 'utf8')
  const externalArtData = JSON.parse(externalRaw)
  const wikidataOverrides = await loadWikidataOverrides()
  const mergedSources = applyWikidataOverrides(
    [...(artworks ?? []), ...(easternArtData ?? [])],
    wikidataOverrides
  )
  const normalized = normalizeArtworks([...mergedSources, ...(externalArtData ?? [])])

  const existing = await loadExistingCache()
  let targets = normalized
  if (LIMIT > 0) targets = targets.slice(0, LIMIT)

  const toProbe = SKIP_CACHE
    ? targets
    : targets.filter((art) => {
        const id = String(art.id ?? '')
        const cached = existing[id]
        return !cached || cached.availability === 'unknown'
      })

  console.log(`Probing ${toProbe.length} artworks (${targets.length} in scope, ${normalized.length} total)...`)

  let done = 0
  const probed = await mapPool(toProbe, async (art) => {
    const entry = await probeArtwork(art)
    done += 1
    if (done % 25 === 0 || done === toProbe.length) {
      console.log(`  ${done}/${toProbe.length} probed`)
    }
    return entry
  })

  const entries = { ...existing }
  for (const entry of probed) {
    entries[entry.id] = {
      availability: entry.availability,
      winningUrl: entry.winningUrl,
      checkedAt: entry.checkedAt
    }
  }

  const summary = {
    ok: 0,
    broken: 0,
    none: 0,
    unknown: 0
  }
  for (const entry of Object.values(entries)) {
    const key = entry.availability || 'unknown'
    summary[key] = (summary[key] ?? 0) + 1
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalEntries: Object.keys(entries).length,
    summary,
    entries
  }

  await fs.mkdir(path.dirname(availabilityPath), { recursive: true })
  await fs.writeFile(availabilityPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`Wrote ${path.relative(projectRoot, availabilityPath)}`)
  console.log(`Summary: ${JSON.stringify(summary)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
