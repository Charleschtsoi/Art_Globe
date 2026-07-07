/* global Buffer, process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const EXTERNAL_DATA_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/artworks/external')
const PLACEHOLDER_SRC_PATH = path.resolve(process.cwd(), 'src/assets/art-placeholder.svg')
const PLACEHOLDER_LOCAL_PATH = '/artworks/external/external-unavailable.svg'

const USER_AGENT = 'ArtGlobeExternalLocalizer/1.0 (educational project; contact: local-dev)'
const MAX_ATTEMPTS = Number(process.env.LOCALIZE_EXTERNAL_MAX_ATTEMPTS ?? 5)
const MIN_DELAY_MS = Number(process.env.LOCALIZE_EXTERNAL_MIN_DELAY_MS ?? 120)
const MAX_DELAY_MS = Number(process.env.LOCALIZE_EXTERNAL_MAX_DELAY_MS ?? 380)
const REQUEST_TIMEOUT_MS = Number(process.env.LOCALIZE_EXTERNAL_TIMEOUT_MS ?? 15000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(String(url ?? '').trim())
}

function normalizeSourceUrl(url) {
  const httpsUrl = safeText(url).replace(/^http:\/\//i, 'https://')
  if (!httpsUrl) return ''
  if (httpsUrl.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
    try {
      const parsed = new URL(httpsUrl)
      parsed.searchParams.set('width', '640')
      return parsed.toString()
    } catch {
      return httpsUrl
    }
  }
  return httpsUrl
}

async function fetchBufferWithRetry(url) {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeoutError = new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`)
      let timer = null
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(timeoutError)
        }, REQUEST_TIMEOUT_MS)
      })
      const fetchPromise = fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*,*/*;q=0.8'
        },
        signal: controller.signal
      })
      const response = await Promise.race([fetchPromise, timeoutPromise])
      if (timer) clearTimeout(timer)
      if (!response.ok) throw new Error(`request failed (${response.status})`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`non-image content type: ${contentType}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType
      }
    } catch (error) {
      lastError = error
      const statusMatch = String(error?.message ?? '').match(/\((\d+)\)/)
      const statusCode = statusMatch ? Number(statusMatch[1]) : null
      const baseDelay = statusCode === 429 ? 1400 : 340
      const delay = baseDelay * 2 ** (attempt - 1) + randInt(120, 460)
      await sleep(delay)
    }
  }
  throw lastError ?? new Error('fetch failed')
}

function extensionFromType(contentType, url) {
  const type = safeText(contentType).toLowerCase()
  if (type.includes('image/png')) return 'png'
  if (type.includes('image/webp')) return 'webp'
  if (type.includes('image/gif')) return 'gif'
  if (type.includes('image/jpeg') || type.includes('image/jpg')) return 'jpg'
  const fromUrl = safeText(url).split('?')[0].split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromUrl)) {
    return fromUrl === 'jpeg' ? 'jpg' : fromUrl
  }
  return 'jpg'
}

async function ensurePlaceholder() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const placeholderTarget = path.join(OUTPUT_DIR, 'external-unavailable.svg')
  try {
    await fs.access(placeholderTarget)
  } catch {
    const placeholderSource = await fs.readFile(PLACEHOLDER_SRC_PATH)
    await fs.writeFile(placeholderTarget, placeholderSource)
  }
}

async function main() {
  await ensurePlaceholder()

  const externalRaw = await fs.readFile(EXTERNAL_DATA_PATH, 'utf8')
  const externalData = JSON.parse(externalRaw)
  if (!Array.isArray(externalData)) throw new Error('externalArtData.json must be an array')

  const urlCache = new Map()
  const hashToLocalPath = new Map()
  const failed = []
  let localized = 0
  let skippedLocal = 0
  let attemptedRemote = 0

  for (let index = 0; index < externalData.length; index += 1) {
    const record = externalData[index]
    const rawUrl = safeText(record?.imageUrl)
    if (!rawUrl) continue

    if (!isRemoteUrl(rawUrl)) {
      skippedLocal += 1
      continue
    }
    attemptedRemote += 1

    const sourceUrl = normalizeSourceUrl(rawUrl)
    if (!sourceUrl) continue

    if (urlCache.has(sourceUrl)) {
      const localPath = urlCache.get(sourceUrl)
      record.imageUrl = localPath
      if (!record.canonicalImageUrl) record.canonicalImageUrl = sourceUrl
      localized += 1
      continue
    }

    try {
      const { buffer, contentType } = await fetchBufferWithRetry(sourceUrl)
      const hash = crypto.createHash('sha1').update(buffer).digest('hex')
      let localPath = hashToLocalPath.get(hash)
      if (!localPath) {
        const extension = extensionFromType(contentType, sourceUrl)
        const fileName = `external-${hash.slice(0, 16)}.${extension}`
        const filePath = path.join(OUTPUT_DIR, fileName)
        await fs.writeFile(filePath, buffer)
        localPath = `/artworks/external/${fileName}`
        hashToLocalPath.set(hash, localPath)
      }
      urlCache.set(sourceUrl, localPath)
      record.imageUrl = localPath
      if (!record.canonicalImageUrl) record.canonicalImageUrl = sourceUrl
      localized += 1
      await sleep(randInt(MIN_DELAY_MS, MAX_DELAY_MS))
      if (attemptedRemote % 25 === 0) {
        console.log(`Progress: ${attemptedRemote} remote external records processed`)
      }
    } catch (error) {
      if (!record.canonicalImageUrl) record.canonicalImageUrl = sourceUrl
      record.imageUrl = PLACEHOLDER_LOCAL_PATH
      failed.push({
        id: record?.id ?? `idx-${index}`,
        title: safeText(record?.title, 'Untitled'),
        imageUrl: sourceUrl,
        reason: error.message
      })
      await sleep(randInt(MIN_DELAY_MS + 160, MAX_DELAY_MS + 420))
    }
  }

  await fs.writeFile(EXTERNAL_DATA_PATH, JSON.stringify(externalData, null, 2), 'utf8')

  console.log(`Localized external records: ${localized}`)
  console.log(`Already-local external records: ${skippedLocal}`)
  console.log(`Remote external records attempted: ${attemptedRemote}`)
  if (failed.length) {
    console.log(`Failed to localize: ${failed.length}`)
    failed.slice(0, 20).forEach((item) => {
      console.warn(` - [${item.id}] ${item.title}: ${item.reason}`)
    })
    if (failed.length > 20) console.warn(` - ... ${failed.length - 20} more failures`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

