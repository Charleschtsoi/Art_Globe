/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'

const INPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-validated.json')
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp/kaggle6-local-for-merge.json')
const OUT_DIR = path.resolve(process.cwd(), 'public/artworks/kaggle6')

/** Max width or height in pixels (fit inside, no upscale). Default keeps thumbnails small for static hosting. */
const MAX_EDGE = Number(process.env.KAGGLE6_LOCAL_IMAGE_MAX_EDGE ?? 512)
/** jpeg: 1–100, webp: 1–100 */
const QUALITY = Number(process.env.KAGGLE6_LOCAL_IMAGE_QUALITY ?? 80)
/** `webp` (default, smaller) or `jpeg` */
const FORMAT = String(process.env.KAGGLE6_LOCAL_IMAGE_FORMAT ?? 'webp').toLowerCase()

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function hashId(id) {
  return crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 16)
}

function outputExtension() {
  if (FORMAT === 'jpeg' || FORMAT === 'jpg') return 'jpg'
  return 'webp'
}

/**
 * Resize and compress source image into public/artworks/kaggle6 for the dev server.
 * Falls back to raw copy if sharp fails (e.g. corrupt file).
 */
async function writeThumbnail(srcAbs, destAbs) {
  const pipeline = sharp(srcAbs).rotate().resize(MAX_EDGE, MAX_EDGE, {
    fit: 'inside',
    withoutEnlargement: true
  })
  if (FORMAT === 'jpeg' || FORMAT === 'jpg') {
    await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toFile(destAbs)
  } else {
    await pipeline.webp({ quality: QUALITY }).toFile(destAbs)
  }
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const accepted = Array.isArray(parsed?.accepted) ? parsed.accepted : []
  if (!accepted.length) throw new Error(`No accepted records in ${INPUT_PATH}. Run kaggle6:validate first.`)

  await fs.mkdir(OUT_DIR, { recursive: true })

  const extOut = outputExtension()
  const records = []
  let copied = 0
  let skipped = 0
  let fallbackCopy = 0

  for (const item of accepted) {
    const localPath = safeText(item.localImagePath)
    const id = safeText(item.candidateId || item.id)
    if (!localPath || !id) {
      skipped += 1
      continue
    }
    try {
      await fs.access(localPath)
    } catch {
      skipped += 1
      continue
    }
    const base = `kaggle6-${hashId(id)}`
    const filename = `${base}.${extOut}`
    const destAbs = path.join(OUT_DIR, filename)
    try {
      await writeThumbnail(localPath, destAbs)
    } catch (err) {
      console.warn(`sharp failed for ${localPath}, copying raw:`, err.message)
      const rawExt = path.extname(localPath).replace('.', '').toLowerCase()
      const fallbackName =
        rawExt && ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt)
          ? `${base}.${rawExt === 'jpeg' ? 'jpg' : rawExt}`
          : `${base}.jpg`
      const fallbackDest = path.join(OUT_DIR, fallbackName)
      await fs.copyFile(localPath, fallbackDest)
      fallbackCopy += 1
      const webPath = `/artworks/kaggle6/${fallbackName}`
      copied += 1
      records.push({
        ...item,
        imageUrl: webPath,
        canonicalImageUrl: safeText(item.canonicalImageUrl) || webPath
      })
      continue
    }
    const webPath = `/artworks/kaggle6/${filename}`
    copied += 1
    records.push({
      ...item,
      imageUrl: webPath,
      canonicalImageUrl: safeText(item.canonicalImageUrl) || webPath
    })
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'local-public',
        compression: {
          maxEdge: MAX_EDGE,
          quality: QUALITY,
          format: FORMAT
        },
        inputAccepted: accepted.length,
        copiedCount: copied,
        sharpFallbackRawCopy: fallbackCopy,
        skippedMissingPath: skipped,
        outputCount: records.length,
        records
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(
    `Kaggle6 local images: processed=${copied} skipped=${skipped} rawFallback=${fallbackCopy} → ${path.relative(process.cwd(), OUTPUT_PATH)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
