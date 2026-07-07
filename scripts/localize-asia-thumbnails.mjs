/* global Buffer, process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { artworks, easternArtData } from '../src/artData.js'

const EXTERNAL_DATA_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const ART_DATA_PATH = path.resolve(process.cwd(), 'src/artData.js')
const ASIA_OUTPUT_DIR = path.resolve(process.cwd(), 'public/artworks/asia')
const PLACEHOLDER_SRC_PATH = path.resolve(process.cwd(), 'src/assets/art-placeholder.svg')
const PLACEHOLDER_LOCAL_PATH = '/artworks/asia/asia-unavailable.svg'
const USER_AGENT = 'ArtGlobeLocalizer/1.0 (educational project; contact: local-dev)'
const MAX_ATTEMPTS = Number(process.env.LOCALIZE_ASIA_MAX_ATTEMPTS ?? 5)
const MIN_DELAY_MS = Number(process.env.LOCALIZE_ASIA_MIN_DELAY_MS ?? 120)
const MAX_DELAY_MS = Number(process.env.LOCALIZE_ASIA_MAX_DELAY_MS ?? 380)
const REQUEST_TIMEOUT_MS = Number(process.env.LOCALIZE_ASIA_TIMEOUT_MS ?? 15000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const safeText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const toJsString = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, ' ')

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(String(url ?? '').trim())
}

function classifyRegion(lat, lng) {
  const nLat = Number(lat)
  const nLng = Number(lng)
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return 'other'
  if (nLat >= 17 && nLat <= 56 && nLng >= 98 && nLng <= 151) return 'east_asia'
  if (nLat >= -12 && nLat <= 60 && nLng >= 25 && nLng <= 170) return 'asia'
  return 'other'
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
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/*,*/*;q=0.8'
        },
        signal: controller.signal
      })
      clearTimeout(timer)
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

function isAsiaRecord(record) {
  const region = classifyRegion(record?.lat, record?.lng)
  return region === 'east_asia' || region === 'asia'
}

function toDatasetRecord(raw, defaults = {}) {
  return {
    ...raw,
    museumName: safeText(raw?.museumName ?? raw?.museum, safeText(defaults.museumName, 'Unknown Museum')),
    imageUrl: safeText(raw?.imageUrl),
    canonicalImageUrl: safeText(raw?.canonicalImageUrl)
  }
}

async function localizeRecords(records) {
  await fs.mkdir(ASIA_OUTPUT_DIR, { recursive: true })
  const placeholderTarget = path.join(ASIA_OUTPUT_DIR, 'asia-unavailable.svg')
  try {
    await fs.access(placeholderTarget)
  } catch {
    const placeholderSource = await fs.readFile(PLACEHOLDER_SRC_PATH)
    await fs.writeFile(placeholderTarget, placeholderSource)
  }

  const urlCache = new Map()
  const hashToLocalPath = new Map()
  const failed = []
  let localized = 0
  let skippedLocal = 0

  let attemptedRemote = 0
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const rawUrl = safeText(record.imageUrl)
    if (!rawUrl || !isAsiaRecord(record)) continue
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
        const fileName = `asia-${hash.slice(0, 16)}.${extension}`
        const filePath = path.join(ASIA_OUTPUT_DIR, fileName)
        await fs.writeFile(filePath, buffer)
        localPath = `/artworks/asia/${fileName}`
        hashToLocalPath.set(hash, localPath)
      }
      urlCache.set(sourceUrl, localPath)
      record.imageUrl = localPath
      if (!record.canonicalImageUrl) record.canonicalImageUrl = sourceUrl
      localized += 1
      await sleep(randInt(MIN_DELAY_MS, MAX_DELAY_MS))
      if (attemptedRemote % 25 === 0) {
        console.log(`Progress: ${attemptedRemote} remote Asia records processed`)
      }
    } catch (error) {
      if (!record.canonicalImageUrl) record.canonicalImageUrl = sourceUrl
      record.imageUrl = PLACEHOLDER_LOCAL_PATH
      failed.push({
        id: record.id ?? `idx-${index}`,
        title: safeText(record.title, 'Untitled'),
        imageUrl: sourceUrl,
        reason: error.message
      })
      await sleep(randInt(MIN_DELAY_MS + 160, MAX_DELAY_MS + 420))
    }
  }

  return {
    records,
    localized,
    skippedLocal,
    attemptedRemote,
    failed
  }
}

function formatArtDataBlock(name, data) {
  const lines = data.map((art) => `  {
    id: ${typeof art.id === 'number' ? art.id : `'${toJsString(art.id)}'`},
    title: '${toJsString(art.title)}',
    artist: '${toJsString(art.artist)}',
    ${art.year !== undefined ? `year: ${typeof art.year === 'number' ? art.year : `'${toJsString(art.year)}'`},\n    ` : ''}lat: ${Number(art.lat)},
    lng: ${Number(art.lng)},
    imageUrl: '${toJsString(art.imageUrl)}',
    ${art.canonicalImageUrl ? `canonicalImageUrl: '${toJsString(art.canonicalImageUrl)}',\n    ` : ''}${art.description ? `description: '${toJsString(art.description)}',\n    ` : ''}${art.museumName ? `museumName: '${toJsString(art.museumName)}',\n    ` : art.museum ? `museum: '${toJsString(art.museum)}',\n    ` : ''}${art.source ? `source: '${toJsString(art.source)}',\n    ` : ''}${art.sourceUrl ? `sourceUrl: '${toJsString(art.sourceUrl)}'\n` : '\n'}  }`)
  return `export const ${name} = [\n${lines.join(',\n')}\n]\n`
}

async function writeArtDataFile(nextArtworks, nextEasternArtData) {
  const artworksBlock = formatArtDataBlock('artworks', nextArtworks)
  const easternBlock = formatArtDataBlock('easternArtData', nextEasternArtData)
  const fileContents = `${artworksBlock}\n${easternBlock}`
  await fs.writeFile(ART_DATA_PATH, fileContents, 'utf8')
}

async function main() {
  const externalRaw = await fs.readFile(EXTERNAL_DATA_PATH, 'utf8')
  const externalData = JSON.parse(externalRaw)

  const normalizedArtworks = (artworks || []).map((item) => toDatasetRecord(item))
  const normalizedEastern = (easternArtData || []).map((item) => toDatasetRecord(item))
  const normalizedExternal = (externalData || []).map((item) => toDatasetRecord(item))

  const allRecords = [...normalizedArtworks, ...normalizedEastern, ...normalizedExternal]
  const { localized, skippedLocal, attemptedRemote, failed } = await localizeRecords(allRecords)

  const nextArtworks = allRecords.slice(0, normalizedArtworks.length)
  const nextEastern = allRecords.slice(normalizedArtworks.length, normalizedArtworks.length + normalizedEastern.length)
  const nextExternal = allRecords.slice(normalizedArtworks.length + normalizedEastern.length)

  await writeArtDataFile(nextArtworks, nextEastern)
  await fs.writeFile(EXTERNAL_DATA_PATH, JSON.stringify(nextExternal, null, 2), 'utf8')

  console.log(`Localized Asia records: ${localized}`)
  console.log(`Already-local Asia records: ${skippedLocal}`)
  console.log(`Remote Asia records attempted: ${attemptedRemote}`)
  if (failed.length) {
    console.log(`Failed to localize: ${failed.length}`)
    failed.slice(0, 20).forEach((item) => {
      console.warn(` - [${item.id}] ${item.title}: ${item.reason}`)
    })
    if (failed.length > 20) {
      console.warn(` - ... ${failed.length - 20} more failures`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
