/* global process */
/**
 * Rewrite `/artworks/...` paths to absolute R2 public URLs in:
 * - src/data/externalArtData.json
 * - src/artData.js (string literal paths)
 *
 * Requires R2_PUBLIC_BASE_URL and optional R2_KEY_PREFIX (must match upload script).
 * Run after: npm run upload:artworks:r2
 * Then: npm run data:runtime
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'

const EXTERNAL_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const ART_DATA_PATH = path.resolve(process.cwd(), 'src/artData.js')

const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
const R2_KEY_PREFIX = String(process.env.R2_KEY_PREFIX ?? '').replace(/^\/+|\/+$/g, '')

const DRY_RUN = String(process.env.REWRITE_CDN_DRY_RUN ?? '').toLowerCase() === 'true'

function r2ObjectKey(relativeFromArtworks) {
  const clean = String(relativeFromArtworks).replace(/^\/+/, '').replace(/\\/g, '/')
  if (!R2_KEY_PREFIX) return clean
  return `${R2_KEY_PREFIX}/${clean}`
}

function toCdnUrl(localPath) {
  const s = String(localPath ?? '').trim()
  if (!s) return s
  if (/^https?:\/\//i.test(s)) return s
  if (!s.startsWith('/artworks/')) return s
  const rest = s.replace(/^\/artworks\//, '')
  const key = r2ObjectKey(rest)
  return `${R2_PUBLIC_BASE_URL}/${key}`
}

function rewriteDeep(value) {
  if (typeof value === 'string') return toCdnUrl(value)
  if (Array.isArray(value)) return value.map(rewriteDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = rewriteDeep(v)
    }
    return out
  }
  return value
}

async function rewriteArtDataJs() {
  const raw = await fs.readFile(ART_DATA_PATH, 'utf8')
  /** Match quoted paths like '/artworks/foo/bar.webp' */
  const replaced = raw.replace(/(['"])\/artworks\/([^'"]+)\1/g, (full, quote, restPath) => {
    const url = toCdnUrl(`/artworks/${restPath}`)
    return `${quote}${url}${quote}`
  })
  if (replaced === raw) {
    console.log('artData.js: no /artworks/ paths changed (already CDN or empty).')
  } else {
    if (!DRY_RUN) await fs.writeFile(ART_DATA_PATH, replaced, 'utf8')
    console.log(`artData.js: rewritten paths${DRY_RUN ? ' (dry-run, file unchanged)' : ''}`)
  }
}

async function main() {
  if (!R2_PUBLIC_BASE_URL) {
    throw new Error('Set R2_PUBLIC_BASE_URL to your R2 public base (e.g. https://pub-xxxxx.r2.dev)')
  }

  const extRaw = await fs.readFile(EXTERNAL_PATH, 'utf8')
  const data = JSON.parse(extRaw)
  if (!Array.isArray(data)) throw new Error('externalArtData.json must be an array')
  const next = rewriteDeep(data)
  if (!DRY_RUN) {
    await fs.writeFile(EXTERNAL_PATH, JSON.stringify(next, null, 2), 'utf8')
  }
  console.log(`externalArtData.json: ${data.length} rows processed${DRY_RUN ? ' (dry-run)' : ''}`)

  await rewriteArtDataJs()

  console.log('Next: npm run data:runtime')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
