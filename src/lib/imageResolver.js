/** @typedef {'thumb' | 'detail'} ImageSize */

const SIZE_PX = {
  thumb: 256,
  detail: 1024
}

const PLACEHOLDER_PATTERNS = [
  'external-unavailable',
  'asia-unavailable',
  'art-placeholder'
]

/**
 * @param {string | null | undefined} url
 */
export function isHttpsImageUrl(url) {
  if (typeof url !== 'string') return false
  const s = url.trim()
  return s.startsWith('https://') || s.startsWith('http://')
}

/**
 * @param {string | null | undefined} url
 */
export function isLocalArtworkPath(url) {
  if (typeof url !== 'string') return false
  return url.trim().startsWith('/artworks/')
}

/**
 * @param {string | null | undefined} url
 */
export function isPlaceholderImageUrl(url) {
  if (typeof url !== 'string') return true
  const low = url.trim().toLowerCase()
  if (!low) return true
  return PLACEHOLDER_PATTERNS.some((p) => low.includes(p))
}

/**
 * @param {string} provider
 * @param {string} url
 */
export function detectImageProvider(url) {
  const s = String(url ?? '').toLowerCase()
  if (s.includes('commons.wikimedia.org/wiki/special:filepath/')) return 'wikimedia'
  if (s.includes('/iiif/2/') && s.includes('/full/')) return 'iiif'
  if (s.includes('upload.wikimedia.org')) return 'wikimedia-static'
  if (s.includes('metmuseum.org') || s.includes('images.metmuseum.org')) return 'met'
  if (s.includes('colbase.nich.go.jp')) return 'museum'
  return 'direct'
}

/**
 * Resize a remote image URL for the requested display size.
 * @param {string | null | undefined} url
 * @param {ImageSize} [size='thumb']
 * @returns {string}
 */
export function resizeImageUrl(url, size = 'thumb') {
  if (!url || typeof url !== 'string') return ''
  const width = SIZE_PX[size] ?? SIZE_PX.thumb
  const httpsUrl = url.trim().replace(/^http:\/\//i, 'https://')
  if (!httpsUrl) return ''

  if (httpsUrl.includes('/iiif/2/') && httpsUrl.includes('/full/')) {
    return httpsUrl.replace(/\/full\/\d+,\/0\/default\.(jpg|png|webp)$/i, `/full/${width},/0/default.$1`)
  }

  if (httpsUrl.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
    try {
      const parsed = new URL(httpsUrl)
      parsed.searchParams.set('width', String(width))
      return parsed.toString()
    } catch {
      return httpsUrl.includes('?')
        ? httpsUrl.replace(/([?&])width=\d+/i, `$1width=${width}`)
        : `${httpsUrl}?width=${width}`
    }
  }

  if (httpsUrl.includes('upload.wikimedia.org') && httpsUrl.includes('/thumb/')) {
    return httpsUrl.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`)
  }

  return httpsUrl.replace(/\/(\d+)px-/i, `/${width}px-`)
}

/**
 * Collect unique external image URL candidates from an artwork record.
 * @param {Record<string, unknown>} art
 * @returns {string[]}
 */
export function collectImageCandidates(art) {
  const seen = new Set()
  /** @type {string[]} */
  const out = []

  const add = (value) => {
    if (typeof value !== 'string') return
    const s = value.trim()
    if (!s || isPlaceholderImageUrl(s)) return
    if (isLocalArtworkPath(s)) return
    if (!isHttpsImageUrl(s)) return
    const key = s.replace(/^http:\/\//i, 'https://')
    if (seen.has(key)) return
    seen.add(key)
    out.push(key)
  }

  const assets = /** @type {Record<string, unknown> | undefined} */ (art?.assets)
  if (Array.isArray(assets?.sources)) {
    for (const src of assets.sources) {
      if (src && typeof src === 'object' && 'url' in src) {
        add(/** @type {{ url?: string }} */ (src).url)
      }
    }
  }

  add(art?.canonicalImageUrl)
  add(assets?.high_res_url)
  add(assets?.thumbnail_url)
  add(art?.imageUrl)

  return out
}

/**
 * Resolve the best image URL for an artwork at the requested size.
 * @param {Record<string, unknown> | null | undefined} art
 * @param {{ size?: ImageSize }} [options]
 * @returns {string}
 */
export function resolveArtworkImageUrl(art, options = {}) {
  const size = options.size ?? 'thumb'
  if (!art || typeof art !== 'object') return ''

  const assets = /** @type {Record<string, unknown> | undefined} */ (art.assets)
  const probedThumb =
    typeof assets?.thumbnail_url === 'string' && isHttpsImageUrl(assets.thumbnail_url)
      ? assets.thumbnail_url.trim()
      : ''
  const probedHigh =
    typeof assets?.high_res_url === 'string' && isHttpsImageUrl(assets.high_res_url)
      ? assets.high_res_url.trim()
      : ''

  if (size === 'detail' && probedHigh) return resizeImageUrl(probedHigh, 'detail')
  if (size === 'thumb' && probedThumb) return resizeImageUrl(probedThumb, 'thumb')

  const primary =
    typeof art.imageUrl === 'string' && isHttpsImageUrl(art.imageUrl) ? art.imageUrl.trim() : ''
  if (primary && !isPlaceholderImageUrl(primary)) {
    return resizeImageUrl(primary, size)
  }

  const candidates = collectImageCandidates(art)
  if (candidates.length > 0) return resizeImageUrl(candidates[0], size)

  const local =
    typeof art.imageUrl === 'string' && isLocalArtworkPath(art.imageUrl) ? art.imageUrl.trim() : ''
  return local
}

/**
 * @param {string | null | undefined} url
 */
export function shouldUseCrossOrigin(url) {
  if (!isHttpsImageUrl(url)) return false
  const provider = detectImageProvider(String(url))
  return provider === 'iiif' || provider === 'wikimedia'
}

/**
 * Backward-compatible alias used by markers.
 * @param {string | null | undefined} url
 * @param {ImageSize} [size='thumb']
 */
export function getMarkerImageUrl(url, size = 'thumb') {
  if (!url) return ''
  return resizeImageUrl(url, size)
}
