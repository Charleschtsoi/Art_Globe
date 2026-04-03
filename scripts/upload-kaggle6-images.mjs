/* global Buffer, process */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-validated.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-uploaded.json')

/** Explicit: `r2` | `supabase`. Empty = auto (R2 if all R2_* set, else Supabase Storage). */
const KAGGLE6_IMAGE_STORAGE = String(process.env.KAGGLE6_IMAGE_STORAGE ?? '').toLowerCase()

const SUPABASE_URL = String(process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'art-images'

const R2_ACCOUNT_ID = String(process.env.R2_ACCOUNT_ID ?? '').trim()
const R2_ACCESS_KEY_ID = String(process.env.R2_ACCESS_KEY_ID ?? '').trim()
const R2_SECRET_ACCESS_KEY = String(process.env.R2_SECRET_ACCESS_KEY ?? '').trim()
const R2_BUCKET_NAME = String(process.env.R2_BUCKET_NAME ?? '').trim()
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
const R2_KEY_PREFIX = String(process.env.R2_KEY_PREFIX ?? '').replace(/^\/+|\/+$/g, '')

const IMAGE_MAX_BYTES = Number(process.env.KAGGLE6_IMAGE_MAX_BYTES ?? 350000)
const DRY_RUN = String(process.env.SUPABASE_DRY_RUN ?? '').toLowerCase() === 'true'

const UPLOAD_MAX_ATTEMPTS = Number(process.env.KAGGLE6_UPLOAD_MAX_ATTEMPTS ?? 5)
const UPLOAD_INITIAL_BACKOFF_MS = Number(process.env.KAGGLE6_UPLOAD_INITIAL_BACKOFF_MS ?? 800)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}

function extFromPath(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}

function hasR2Config() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_BASE_URL)
}

function hasSupabaseStorageConfig() {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

function resolveStorageBackend() {
  if (KAGGLE6_IMAGE_STORAGE === 'r2') {
    if (!hasR2Config()) {
      throw new Error(
        'KAGGLE6_IMAGE_STORAGE=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL'
      )
    }
    return 'r2'
  }
  if (KAGGLE6_IMAGE_STORAGE === 'supabase') {
    if (!hasSupabaseStorageConfig()) {
      throw new Error('KAGGLE6_IMAGE_STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    }
    return 'supabase'
  }
  if (hasR2Config()) return 'r2'
  if (hasSupabaseStorageConfig()) return 'supabase'
  throw new Error(
    'Image storage: set Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL) or Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Or set KAGGLE6_IMAGE_STORAGE=r2|supabase explicitly.'
  )
}

function r2ObjectKey(objectPath) {
  if (!R2_KEY_PREFIX) return objectPath
  return `${R2_KEY_PREFIX}/${objectPath}`
}

let r2Client = null
function getR2Client() {
  if (!r2Client) {
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

async function uploadToR2(objectPath, buffer, mimeType = 'image/jpeg') {
  const key = r2ObjectKey(objectPath)
  const client = getR2Client()
  let lastErr
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: mimeType
        })
      )
      return `${R2_PUBLIC_BASE_URL}/${key}`
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

async function uploadToSupabaseStorage(objectPath, buffer, mimeType = 'image/jpeg') {
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${objectPath}`
  let lastErr
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': mimeType,
          'x-upsert': 'true'
        },
        body: buffer
      })
      if (response.ok) {
        return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${objectPath}`
      }
      const text = await response.text()
      const retryable = response.status === 502 || response.status === 503 || response.status === 429
      if (!retryable || attempt >= UPLOAD_MAX_ATTEMPTS) {
        throw new Error(`Supabase storage upload failed (${response.status}): ${text.slice(0, 220)}`)
      }
    } catch (err) {
      lastErr = err
      if (err?.message?.includes?.('Supabase storage upload failed')) throw err
      if (attempt >= UPLOAD_MAX_ATTEMPTS) throw err
    }
    const wait = Math.min(UPLOAD_INITIAL_BACKOFF_MS * 2 ** (attempt - 1), 15000)
    await sleep(wait)
  }
  throw lastErr ?? new Error('Supabase storage upload failed')
}

function inferMimeType(ext) {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function main() {
  const backend = resolveStorageBackend()
  if (!DRY_RUN && backend === 'r2' && !hasR2Config()) {
    throw new Error('R2 configuration incomplete.')
  }
  if (!DRY_RUN && backend === 'supabase' && !hasSupabaseStorageConfig()) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Supabase Storage.')
  }

  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const validated = JSON.parse(raw)
  const accepted = Array.isArray(validated?.accepted) ? validated.accepted : []
  if (!accepted.length) throw new Error('No validated Kaggle6 records. Run kaggle6:validate first.')

  const uploadOne =
    backend === 'r2'
      ? (objectPath, buf, mime) => uploadToR2(objectPath, buf, mime)
      : (objectPath, buf, mime) => uploadToSupabaseStorage(objectPath, buf, mime)

  const hashCache = new Map()
  const uploadedRecords = []
  let uploadedCount = 0
  let reusedCount = 0
  let skippedOversized = 0

  console.log(`Kaggle6 image upload: backend=${backend}${DRY_RUN ? ' (dry-run)' : ''}`)

  for (let index = 0; index < accepted.length; index += 1) {
    const record = accepted[index]
    const localPath = safeText(record.localImagePath)
    if (!localPath) continue
    const buffer = await fs.readFile(localPath)
    if (buffer.byteLength > IMAGE_MAX_BYTES) {
      skippedOversized += 1
      continue
    }
    const hash = hashBuffer(buffer)
    const ext = extFromPath(localPath)
    const objectPath = `kaggle6/${hash.slice(0, 2)}/kaggle6-${hash.slice(0, 20)}.${ext}`
    let imageUrl = hashCache.get(hash)
    if (imageUrl) {
      reusedCount += 1
    } else {
      if (DRY_RUN) {
        imageUrl =
          backend === 'r2'
            ? `${R2_PUBLIC_BASE_URL || 'https://r2-dry-run.local'}/${r2ObjectKey(objectPath)}`
            : `/supabase-dry-run/${SUPABASE_STORAGE_BUCKET}/${objectPath}`
      } else {
        imageUrl = await uploadOne(objectPath, buffer, inferMimeType(ext))
      }
      hashCache.set(hash, imageUrl)
      uploadedCount += 1
    }

    uploadedRecords.push({
      ...record,
      imageUrl,
      canonicalImageUrl: safeText(record.canonicalImageUrl || imageUrl),
      imageHash: hash
    })
    if ((index + 1) % 100 === 0) {
      console.log(`Kaggle6 upload progress: ${index + 1}/${accepted.length}`)
    }
  }

  const mode = DRY_RUN ? `${backend}-dry-run` : backend === 'r2' ? 'cloudflare-r2' : 'supabase-storage'
  const bucketLabel = backend === 'r2' ? R2_BUCKET_NAME : SUPABASE_STORAGE_BUCKET

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode,
        storageBackend: backend,
        bucket: bucketLabel,
        inputCount: accepted.length,
        uploadedCount,
        reusedCount,
        skippedOversized,
        outputCount: uploadedRecords.length,
        records: uploadedRecords
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Kaggle6 upload complete. uploaded=${uploadedCount} reused=${reusedCount} output=${uploadedRecords.length}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
