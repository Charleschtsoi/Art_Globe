/* global Buffer, process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/archive3-validated.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/archive3-uploaded.json')
const LOCAL_OUTPUT_DIR = path.resolve(process.cwd(), 'public/artworks/archive3')
const MODE = String(process.env.ARCHIVE3_UPLOAD_MODE ?? 'local').toLowerCase()
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? ''
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET ?? ''
const CDN_BASE_URL = String(process.env.ARCHIVE3_CDN_BASE_URL ?? '').replace(/\/$/, '')

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}

function extFromPath(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}

async function uploadToCloudinary(buffer, fileName) {
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`
  const form = new FormData()
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  form.append('file', new Blob([buffer]), fileName)
  form.append('folder', 'art-globe/archive3')
  const response = await fetch(endpoint, {
    method: 'POST',
    body: form
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cloudinary upload failed (${response.status}): ${text.slice(0, 200)}`)
  }
  const data = await response.json()
  return safeText(data.secure_url || data.url)
}

async function uploadLocal(buffer, fileName) {
  await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true })
  const targetPath = path.join(LOCAL_OUTPUT_DIR, fileName)
  await fs.writeFile(targetPath, buffer)
  const relative = `/artworks/archive3/${fileName}`
  if (CDN_BASE_URL) return `${CDN_BASE_URL}${relative}`
  return relative
}

function resolveMode() {
  if (MODE === 'cloudinary') return 'cloudinary'
  return 'local'
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const validated = JSON.parse(raw)
  const accepted = Array.isArray(validated?.accepted) ? validated.accepted : []
  if (!accepted.length) throw new Error('No validated archive3 records found.')

  const mode = resolveMode()
  if (mode === 'cloudinary' && (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET)) {
    throw new Error('Cloudinary mode requires CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET env vars.')
  }

  const hashCache = new Map()
  const uploadedRecords = []
  let uploadedCount = 0
  let reusedCount = 0

  for (let index = 0; index < accepted.length; index += 1) {
    const record = accepted[index]
    const localPath = safeText(record.localImagePath)
    if (!localPath) continue
    const buffer = await fs.readFile(localPath)
    const hash = hashBuffer(buffer)
    const ext = extFromPath(localPath)
    const fileName = `archive3-${hash.slice(0, 20)}.${ext}`

    let imageUrl = hashCache.get(hash)
    if (imageUrl) {
      reusedCount += 1
    } else {
      if (mode === 'cloudinary') {
        imageUrl = await uploadToCloudinary(buffer, fileName)
        await sleep(90)
      } else {
        imageUrl = await uploadLocal(buffer, fileName)
      }
      hashCache.set(hash, imageUrl)
      uploadedCount += 1
    }

    uploadedRecords.push({
      ...record,
      imageUrl,
      canonicalImageUrl: safeText(record.canonicalImageUrl || record.metadata?.artistWikipedia),
      imageHash: hash
    })

    if ((index + 1) % 100 === 0) {
      console.log(`Upload progress: ${index + 1}/${accepted.length}`)
    }
  }

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode,
        inputCount: accepted.length,
        uploadedCount,
        reusedCount,
        outputCount: uploadedRecords.length,
        records: uploadedRecords
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`Archive-3 image upload complete. Mode: ${mode}`)
  console.log(`Uploaded: ${uploadedCount}, reused by hash: ${reusedCount}, output: ${uploadedRecords.length}`)
  console.log(`Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
