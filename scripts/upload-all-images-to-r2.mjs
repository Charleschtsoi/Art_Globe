/* global Buffer, process */
/**
 * Upload every binary image under public/artworks/ to Cloudflare R2 (same layout as local: artworks/... keys).
 * Requires R2_* env vars (see docs/r2-production-setup.md).
 * Skips .svg (tiny; can stay on Vercel). Writes tmp/r2-bulk-upload-report.json
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const PUBLIC_ARTWORKS = path.resolve(process.cwd(), 'public/artworks')
const REPORT_PATH = path.resolve(process.cwd(), 'tmp/r2-bulk-upload-report.json')

const R2_ACCOUNT_ID = String(process.env.R2_ACCOUNT_ID ?? '').trim()
const R2_ACCESS_KEY_ID = String(process.env.R2_ACCESS_KEY_ID ?? '').trim()
const R2_SECRET_ACCESS_KEY = String(process.env.R2_SECRET_ACCESS_KEY ?? '').trim()
const R2_BUCKET_NAME = String(process.env.R2_BUCKET_NAME ?? '').trim()
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
const R2_KEY_PREFIX = String(process.env.R2_KEY_PREFIX ?? '').replace(/^\/+|\/+$/g, '')

const DRY_RUN = String(process.env.R2_BULK_UPLOAD_DRY_RUN ?? '').toLowerCase() === 'true'
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.R2_BULK_UPLOAD_CONCURRENCY ?? 8)))

const UPLOAD_MAX_ATTEMPTS = Number(process.env.R2_UPLOAD_MAX_ATTEMPTS ?? 5)
const UPLOAD_INITIAL_BACKOFF_MS = Number(process.env.R2_UPLOAD_INITIAL_BACKOFF_MS ?? 800)

const BINARY_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function r2ObjectKey(relativeFromArtworks) {
  const clean = relativeFromArtworks.replace(/^\/+/, '').replace(/\\/g, '/')
  if (!R2_KEY_PREFIX) return clean
  return `${R2_KEY_PREFIX}/${clean}`
}

function mimeForExt(ext) {
  const e = ext.toLowerCase()
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.png') return 'image/png'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

let r2Client = null
function getR2Client() {
  if (!r2Client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      throw new Error(
        'Missing R2 config: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL'
      )
    }
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    })
  }
  return r2Client
}

async function uploadFile(absPath, objectKey) {
  const buf = await fs.readFile(absPath)
  const ext = path.extname(absPath)
  const mime = mimeForExt(ext)
  const client = getR2Client()
  let lastErr
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buf,
          ContentType: mime
        })
      )
      return `${R2_PUBLIC_BASE_URL}/${objectKey}`
    } catch (err) {
      lastErr = err
      if (attempt < UPLOAD_MAX_ATTEMPTS) {
        const wait = Math.min(UPLOAD_INITIAL_BACKOFF_MS * 2 ** (attempt - 1), 15000)
        await sleep(wait)
      }
    }
  }
  throw lastErr
}

async function collectFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...(await collectFiles(full, base)))
    } else {
      const ext = path.extname(ent.name)
      if (BINARY_EXT.has(ext.toLowerCase())) {
        const rel = path.relative(base, full).replace(/\\/g, '/')
        out.push({ abs: full, rel })
      }
    }
  }
  return out
}

async function runPool(items, concurrency, worker) {
  let cursor = 0
  async function workerLoop() {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      await worker(items[idx], idx)
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => workerLoop()))
}

async function main() {
  if (!R2_PUBLIC_BASE_URL) {
    throw new Error('R2_PUBLIC_BASE_URL is required so we can validate public URLs in the report.')
  }

  let files
  try {
    await fs.access(PUBLIC_ARTWORKS)
    files = await collectFiles(PUBLIC_ARTWORKS)
  } catch {
    console.error(`No directory ${path.relative(process.cwd(), PUBLIC_ARTWORKS)} — nothing to upload.`)
    process.exit(1)
  }

  console.log(`Found ${files.length} binary files under public/artworks. dryRun=${DRY_RUN} concurrency=${CONCURRENCY}`)

  const mapping = {}
  const errors = []
  const started = Date.now()

  await runPool(files, CONCURRENCY, async ({ abs, rel }) => {
    const key = r2ObjectKey(rel)
    const webPath = `/artworks/${rel.replace(/\\/g, '/')}`
    try {
      if (DRY_RUN) {
        mapping[webPath] = `${R2_PUBLIC_BASE_URL}/${key}`
        return
      }
      const url = await uploadFile(abs, key)
      mapping[webPath] = url
    } catch (e) {
      errors.push({ rel, key, message: e?.message ?? String(e) })
    }
  })

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: DRY_RUN,
        bucket: R2_BUCKET_NAME,
        publicBaseUrl: R2_PUBLIC_BASE_URL,
        keyPrefix: R2_KEY_PREFIX || null,
        fileCount: files.length,
        uploadedCount: Object.keys(mapping).length,
        errorCount: errors.length,
        durationMs: Date.now() - started,
        errors: errors.slice(0, 50),
        mapping
      },
      null,
      2
    ),
    'utf8'
  )

  const mapOut = path.resolve(process.cwd(), 'tmp/r2-upload-mapping.json')
  await fs.writeFile(mapOut, JSON.stringify(mapping, null, 2), 'utf8')

  console.log(`Done. uploaded=${Object.keys(mapping).length} errors=${errors.length}`)
  console.log(`Report: ${path.relative(process.cwd(), REPORT_PATH)}`)
  console.log(`Mapping: ${path.relative(process.cwd(), mapOut)}`)
  if (errors.length) {
    console.error('Some uploads failed. Fix credentials/network and re-run.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
