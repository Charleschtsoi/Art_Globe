/* global process */
/**
 * Backfill Wikidata P18 image URLs into src/data/wikidata-image-overrides.json
 * (safe JSON sidecar — does not patch artData.js).
 *
 * Run: npm run data:backfill-wikidata-images
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworks, easternArtData } from '../src/artData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const OVERRIDES_PATH = path.resolve(projectRoot, 'src/data/wikidata-image-overrides.json')

const USER_AGENT = 'ArtGlobeWikidataBackfill/1.0 (educational project)'
const MIN_DELAY_MS = Number(process.env.BACKFILL_MIN_DELAY_MS ?? 200)
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 0)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function wikidataIdFromUrl(sourceUrl) {
  const m = String(sourceUrl ?? '').match(/\/entity\/(Q\d+)/i)
  return m ? m[1] : ''
}

import { resolveCommonsImageUrl } from './lib/commonsImageUrl.mjs'

async function fetchWikidataImageUrl(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
  })
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`)
  const json = await res.json()
  const entity = json?.entities?.[qid]
  const claims = entity?.claims?.P18
  if (!Array.isArray(claims) || claims.length === 0) return ''

  const fileName = claims[0]?.mainsnak?.datavalue?.value
  if (typeof fileName !== 'string' || !fileName.trim()) return ''
  return resolveCommonsImageUrl(fileName.trim(), 640)
}

async function loadExistingOverrides() {
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function main() {
  const pool = [...(artworks ?? []), ...(easternArtData ?? [])]
  const targets = pool.filter((art) => {
    if (art.canonicalImageUrl) return false
    if (String(art.source ?? '') !== 'wikidata') return false
    return Boolean(wikidataIdFromUrl(art.sourceUrl))
  })

  const slice = LIMIT > 0 ? targets.slice(0, LIMIT) : targets
  console.log(`Backfilling ${slice.length} Wikidata image URLs...`)

  const overrides = await loadExistingOverrides()
  let added = 0

  for (const art of slice) {
    const qid = wikidataIdFromUrl(art.sourceUrl)
    const key = String(art.id)
    if (overrides[key]) continue
    try {
      const imageUrl = await fetchWikidataImageUrl(qid)
      if (imageUrl) {
        overrides[key] = imageUrl
        added += 1
        console.log(`  ${key} ${qid} -> ok`)
      } else {
        console.warn(`  ${key} ${qid}: no P18 image`)
      }
    } catch (error) {
      console.warn(`  ${key} ${qid}: ${error.message}`)
    }
    await sleep(MIN_DELAY_MS)
  }

  await fs.mkdir(path.dirname(OVERRIDES_PATH), { recursive: true })
  await fs.writeFile(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf8')
  console.log(`Wrote ${added} new overrides (${Object.keys(overrides).length} total)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
