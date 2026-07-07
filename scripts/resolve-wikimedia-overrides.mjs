/* global process */
/**
 * Convert wikidata-image-overrides.json FilePath URLs to upload.wikimedia.org thumbs.
 * Run: node scripts/resolve-wikimedia-overrides.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCommonsImageUrl } from './lib/commonsImageUrl.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const overridesPath = path.resolve(projectRoot, 'src/data/wikidata-image-overrides.json')
const MIN_DELAY_MS = Number(process.env.BACKFILL_MIN_DELAY_MS ?? 250)
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 0)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const raw = await fs.readFile(overridesPath, 'utf8')
  const overrides = JSON.parse(raw)
  const keys = Object.keys(overrides)
  const slice = LIMIT > 0 ? keys.slice(0, LIMIT) : keys

  let updated = 0
  let failed = 0
  for (const key of slice) {
    const current = String(overrides[key] ?? '')
    if (!current || current.includes('upload.wikimedia.org')) continue
    try {
      const resolved = await resolveCommonsImageUrl(current, 640)
      if (resolved && resolved !== current) {
        overrides[key] = resolved
        updated += 1
        console.log(`  ${key} -> ok`)
      } else if (!resolved) {
        failed += 1
        console.warn(`  ${key}: unresolved`)
      }
    } catch (error) {
      failed += 1
      console.warn(`  ${key}: ${error.message}`)
    }
    await sleep(MIN_DELAY_MS)
  }

  await fs.writeFile(overridesPath, JSON.stringify(overrides, null, 2), 'utf8')
  console.log(`Updated ${updated} overrides (${failed} failed, ${keys.length} total)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
