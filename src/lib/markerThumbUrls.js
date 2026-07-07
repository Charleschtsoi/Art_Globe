import {
  isHttpsImageUrl,
  isLocalArtworkPath,
  isPlaceholderImageUrl,
  resolveArtworkImageUrl
} from './imageResolver.js'

/**
 * @param {Record<string, unknown>[]} markers
 * @returns {string[]}
 */
export function collectMarkerThumbUrls(markers) {
  const urls = new Set()
  for (const art of markers ?? []) {
    const url = resolveArtworkImageUrl(art, { size: 'thumb' })
    if (!url || isPlaceholderImageUrl(url) || isLocalArtworkPath(url)) continue
    if (isHttpsImageUrl(url)) urls.add(url)
  }
  return [...urls]
}
