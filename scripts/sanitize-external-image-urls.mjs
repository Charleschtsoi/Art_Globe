/* global process */
/**
 * Strip non-image HTTPS URLs (e.g. Wikipedia artist pages) from externalArtData.json.
 * Run: node scripts/sanitize-external-image-urls.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isHttpsImageUrl, isLikelyImageUrl } from '../src/lib/imageResolver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const externalPath = path.resolve(projectRoot, 'src/data/externalArtData.json')

function sanitizeRecord(record) {
  let changed = false
  const next = { ...record }
  const fields = ['canonicalImageUrl', 'imageUrl']
  for (const field of fields) {
    const value = next[field]
    if (typeof value === 'string' && isHttpsImageUrl(value) && !isLikelyImageUrl(value)) {
      next[field] = ''
      changed = true
    }
  }
  if (next.assets && typeof next.assets === 'object') {
    next.assets = { ...next.assets }
    for (const field of ['thumbnail_url', 'high_res_url']) {
      const value = next.assets[field]
      if (typeof value === 'string' && isHttpsImageUrl(value) && !isLikelyImageUrl(value)) {
        next.assets[field] = ''
        changed = true
      }
    }
  }
  return { record: next, changed }
}

async function main() {
  const raw = await fs.readFile(externalPath, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('externalArtData.json must be an array')

  let cleared = 0
  const sanitized = data.map((record) => {
    const { record: next, changed } = sanitizeRecord(record)
    if (changed) cleared += 1
    return next
  })

  await fs.writeFile(externalPath, JSON.stringify(sanitized, null, 2), 'utf8')
  console.log(`Sanitized ${cleared} records in ${path.relative(projectRoot, externalPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
