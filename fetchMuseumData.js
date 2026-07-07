/* global process */
/**
 * fetchMuseumData.js
 *
 * Standalone Node.js script to fetch public-domain artworks from ColBase (Japan)
 * and MFA Boston APIs, transform to the globe frontend schema, and save to
 * src/data/externalArtData.json.
 *
 * HOW TO RUN:
 *   From the project root (art-globe/):
 *     node fetchMuseumData.js
 *
 *   Or via npm script:
 *     npm run fetch:museum
 *
 * REQUIREMENTS:
 *   Node.js 18+ (uses native fetch). For older Node, install node-fetch:
 *     npm install node-fetch
 *   and change fetch(...) to use the imported fetch. Alternatively, install
 *   axios and use: const { default: axios } = await import('axios')
 *
 * OPTIONAL - Harvard Art Museums (Boston-area fallback if MFA API unavailable):
 *   Get a free API key at https://www.harvardartmuseums.org/collections/api
 *   Then run: HARVARD_API_KEY=yourkey node fetchMuseumData.js
 *
 * OUTPUT:
 *   src/data/externalArtData.json - Array of { id, title, artist, lat, lng, museum, description, imageUrl, priority }
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const USER_AGENT =
  'ArtGlobeMuseumFetcher/1.0 (educational; https://github.com/art-globe)'

// Minimum image dimension (width or height) to consider "high resolution"
const MIN_IMAGE_SIZE = 400
const TARGET_COUNT = Number(process.env.FETCH_MUSEUM_TARGET_COUNT ?? 300)
const ASIA_SHARE = Number(process.env.FETCH_MUSEUM_ASIA_SHARE ?? 0.7)
const MIN_ASIA_SHARE = Number(process.env.FETCH_MUSEUM_MIN_ASIA_SHARE ?? 0.6)

// Museum coordinates (hardcoded per user request)
const COORDS = {
  colbase: { lat: 35.7187, lng: 139.7765, museum: 'Tokyo National Museum' },
  mfa: { lat: 42.3394, lng: -71.0942, museum: 'Museum of Fine Arts, Boston' },
  harvard: { lat: 42.3744, lng: -71.1142, museum: 'Harvard Art Museums' }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false
  return true
}

function isHighResUrl(url) {
  if (!url) return false
  // Reject only when URL explicitly contains small dimension (e.g. 64px, width=100)
  const m = url.match(/(\d+)px|width=(\d+)|height=(\d+)|(\d+)x(\d+)/i)
  if (m) {
    const nums = m.slice(1).filter(Boolean).map(Number)
    if (nums.length && nums.every((n) => n < MIN_IMAGE_SIZE)) return false
  }
  return true
}

function safeString(val, fallback = '') {
  const s = String(val ?? '').trim()
  return s || fallback
}

function pickFirstUrl(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const first = candidate.find((v) => typeof v === 'string' && v.trim())
      if (first) return first
    } else if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }
  return ''
}

async function fetchColBase() {
  // ColBase is accessible via Japan Search (jpsearch.go.jp) with dataset=cobas.
  // If that fails, the script will still produce MFA data.
  const results = []
  try {
    const baseUrl = 'https://jpsearch.go.jp/api/item/search/jps-cross'
    const params = new URLSearchParams({
      dataset: 'cobas',
      size: '220'
    })
    const url = `${baseUrl}?${params.toString()}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      }
    })
    if (!res.ok) {
      console.warn(`ColBase/Japan Search API returned ${res.status}`)
      return results
    }
    const data = await res.json()
    const list = data?.list ?? data?.results ?? []
    let idx = 0
    for (const item of list) {
      const common = item?.common ?? item
      const title = safeString(
        common?.title ?? common?.dcTitle ?? item?.title,
        'Untitled'
      )
      const thumb = pickFirstUrl(common?.thumbnailUrl, common?.thumbUrl, item?.thumbnailUrl)
      const imageUrl = pickFirstUrl(common?.contentsUrl, common?.imageUrl, thumb)
      if (!isValidImageUrl(imageUrl) || !isHighResUrl(imageUrl)) continue
      const creator =
        common?.creator ?? common?.author ?? item?.creator ?? 'Unknown'
      const desc =
        safeString(common?.description ?? item?.description) ||
        `Japanese artwork from ${COORDS.colbase.museum}.`
      results.push({
        id: `colbase-${idx}`,
        title,
        artist: safeString(creator, 'Unknown'),
        lat: COORDS.colbase.lat,
        lng: COORDS.colbase.lng,
        museum: COORDS.colbase.museum,
        description: desc,
        imageUrl: imageUrl.trim(),
        priority: 1
      })
      idx++
    }
  } catch (err) {
    console.warn('ColBase fetch failed:', err.message)
  }
  return results
}

async function fetchMFA() {
  const results = []
  try {
    const baseUrl = 'https://collections.mfa.org/api/objects'
    const url = `${baseUrl}?size=50&classification=Paintings`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      }
    })
    if (!res.ok) {
      console.warn(`MFA Boston API returned ${res.status}`)
      return results
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      console.warn('MFA Boston did not return JSON; try HARVARD_API_KEY for Boston-area art')
      return results
    }
    const data = await res.json()
    const items = data?.data ?? data?.objects ?? data?.results ?? []
    if (Array.isArray(items)) {
      let idx = 0
      for (const item of items) {
        const title = safeString(item?.title ?? item?.object_name, 'Untitled')
        const img =
          item?.primary_image ?? item?.images?.[0] ?? item?.image_url
        let imageUrl = ''
        if (typeof img === 'string') imageUrl = img
        else if (img?.url) imageUrl = img.url
        else if (img?.baseimageurl) imageUrl = img.baseimageurl
        if (!isValidImageUrl(imageUrl) || !isHighResUrl(imageUrl)) continue
        const artist =
          safeString(
            item?.culture ?? item?.artist ?? item?.people?.[0]?.name ?? ''
          ) || 'Unknown'
        const desc =
          safeString(item?.description ?? item?.label_text) ||
          `Artwork from ${COORDS.mfa.museum}.`
        results.push({
          id: `mfa-${idx}`,
          title,
          artist,
          lat: COORDS.mfa.lat,
          lng: COORDS.mfa.lng,
          museum: COORDS.mfa.museum,
          description: desc,
          imageUrl: imageUrl.trim(),
          priority: 2
        })
        idx++
      }
    }
  } catch (err) {
    console.warn('MFA Boston fetch failed:', err.message)
  }
  return results
}

async function fetchHarvard() {
  const key = process.env.HARVARD_API_KEY
  if (!key) return []
  const results = []
  try {
    const url = `https://api.harvardartmuseums.org/object?apikey=${key}&size=50&classification=Paintings`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
    })
    if (!res.ok) return results
    const data = await res.json()
    const items = data?.records ?? []
    let idx = 0
    for (const item of items) {
      const title = safeString(item?.title, 'Untitled')
      const img = item?.primaryimageurl ?? item?.images?.[0]?.baseimageurl
      if (!isValidImageUrl(img) || !isHighResUrl(img)) continue
      const artist =
        safeString(item?.people?.[0]?.name ?? item?.culture) || 'Unknown'
      const desc =
        safeString(item?.description ?? item?.labeltext) ||
        `Artwork from ${COORDS.harvard.museum}.`
      results.push({
        id: `harvard-${idx}`,
        title,
        artist,
        lat: COORDS.harvard.lat,
        lng: COORDS.harvard.lng,
        museum: COORDS.harvard.museum,
        description: desc,
        imageUrl: img.trim(),
        priority: 3
      })
      idx++
    }
  } catch (err) {
    console.warn('Harvard Art Museums fetch failed:', err.message)
  }
  return results
}

async function main() {
  console.log('Fetching from ColBase (Japan) and MFA Boston...')
  const [colbaseItems, mfaItems, harvardItems] = await Promise.all([
    fetchColBase(),
    fetchMFA(),
    fetchHarvard()
  ])
  await sleep(300)

  let all = [...colbaseItems, ...mfaItems, ...harvardItems]
  all = all.filter(
    (a) =>
      isValidImageUrl(a.imageUrl) &&
      isHighResUrl(a.imageUrl) &&
      a.title &&
      a.title !== 'Untitled'
  )

  const deduped = []
  const seen = new Set()
  for (const a of all) {
    const key = `${a.title}-${a.artist}-${a.imageUrl}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(a)
  }

  const asiaTarget = Math.round(TARGET_COUNT * ASIA_SHARE)
  const asiaPool = deduped.filter((a) => a.priority === 1)
  const globalPool = deduped.filter((a) => a.priority !== 1)
  const selected = [
    ...asiaPool.slice(0, asiaTarget)
  ]
  for (const item of globalPool) {
    if (selected.length >= TARGET_COUNT) break
    selected.push(item)
  }
  for (const item of asiaPool) {
    if (selected.length >= TARGET_COUNT) break
    if (selected.some((s) => s.id === item.id)) continue
    selected.push(item)
  }

  const asiaCount = selected.filter((item) => item.priority === 1).length
  const asiaShare = selected.length ? asiaCount / selected.length : 0
  console.log(
    `Museum feed balance -> East Asia/Asia: ${asiaCount}, Global fallback: ${selected.length - asiaCount}`
  )
  console.log(`Asia share: ${(asiaShare * 100).toFixed(1)}%`)
  if (selected.length > 0 && asiaShare < MIN_ASIA_SHARE) {
    throw new Error(
      `Museum dataset Asia share ${(asiaShare * 100).toFixed(1)}% is below minimum ${(MIN_ASIA_SHARE * 100).toFixed(1)}%`
    )
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(selected, null, 2),
    'utf8'
  )
  console.log(
    `Wrote ${selected.length} artworks to ${path.relative(process.cwd(), OUTPUT_PATH)}`
  )
  if (selected.length === 0) {
    console.log(
      'Tip: For Boston-area art, get a free Harvard key and run: HARVARD_API_KEY=yourkey npm run fetch:museum'
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
