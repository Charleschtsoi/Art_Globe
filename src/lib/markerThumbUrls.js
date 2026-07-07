import { resolveArtworkImageCandidates } from './imageResolver.js'

/**
 * @param {Record<string, unknown>} art
 * @returns {string[]}
 */
export function resolveMarkerThumbCandidates(art) {
  if (!art || typeof art !== 'object') return []

  if (art.isCluster && Array.isArray(art.clusterThumbCandidates) && art.clusterThumbCandidates.length > 0) {
    return art.clusterThumbCandidates.filter((url) => typeof url === 'string' && url.startsWith('https://'))
  }

  return resolveArtworkImageCandidates(art, 'thumb')
}

/**
 * @param {Record<string, unknown>[]} markers
 * @returns {string[]}
 */
export function collectMarkerThumbUrls(markers) {
  const urls = new Set()
  for (const art of markers ?? []) {
    for (const url of resolveMarkerThumbCandidates(art)) {
      urls.add(url)
    }
  }
  return [...urls]
}
