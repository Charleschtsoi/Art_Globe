/**
 * @param {Record<string, unknown>} art
 */
export function locationKey(art) {
  const museum = String(art?.museumName ?? art?.current_location?.museum ?? '').trim()
  const city = String(art?.displayCity ?? art?.current_location?.city ?? '').trim()
  if (museum && city) return `museum:${museum}|${city}`
  const lat = Number(art?.lat)
  const lng = Number(art?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `geo:${lat.toFixed(3)}|${lng.toFixed(3)}`
  }
  return ''
}

function sortByTitle(list) {
  return [...list].sort((a, b) =>
    String(a.displayTitle ?? a.title ?? '').localeCompare(
      String(b.displayTitle ?? b.title ?? ''),
      undefined,
      { sensitivity: 'base' }
    )
  )
}

/**
 * Build ordered list of artworks at the same location for panel / Present navigation.
 * @param {Record<string, unknown> | null} activeMarker
 * @param {Record<string, unknown> | null} selectedItemForPanel
 * @param {Map<string, Record<string, unknown>>} artworkById
 * @param {Record<string, unknown>[]} allArtworks
 * @param {Record<string, unknown> | null} currentArtwork
 * @param {Record<string, unknown>[] | null} preservedQueue
 */
export function buildLocationQueue(
  activeMarker,
  selectedItemForPanel,
  artworkById,
  allArtworks,
  currentArtwork,
  preservedQueue = null
) {
  if (!currentArtwork) return []

  const resolve = (art) => artworkById.get(String(art?.id ?? art?.artwork_id ?? '')) ?? art

  if (Array.isArray(preservedQueue) && preservedQueue.length > 0) {
    const resolved = preservedQueue.map(resolve).filter(Boolean)
    const id = String(currentArtwork.id ?? currentArtwork.artwork_id ?? '')
    if (resolved.some((art) => String(art.id) === id)) return sortByTitle(resolved)
  }

  if (selectedItemForPanel?.isClusterPicker && Array.isArray(selectedItemForPanel.clusterArtworks)) {
    return sortByTitle(selectedItemForPanel.clusterArtworks.map(resolve).filter(Boolean))
  }

  if (activeMarker?.isCluster && Array.isArray(activeMarker.clusterItems)) {
    return sortByTitle(activeMarker.clusterItems.map(resolve).filter(Boolean))
  }

  if (activeMarker?.isMuseumStack && Array.isArray(activeMarker.artworks)) {
    return sortByTitle(activeMarker.artworks.map(resolve).filter(Boolean))
  }

  const resolvedCurrent = resolve(currentArtwork)
  const key = locationKey(resolvedCurrent)
  if (key) {
    const siblings = (allArtworks ?? [])
      .map(resolve)
      .filter((art) => locationKey(art) === key)
    if (siblings.length > 1) return sortByTitle(siblings)
  }

  return [resolvedCurrent].filter(Boolean)
}

/** @deprecated Use buildLocationQueue */
export function buildPresentationQueue(
  activeMarker,
  selectedItemForPanel,
  artworkById,
  visibleArtworks,
  currentArtwork,
  preservedQueue = null
) {
  return buildLocationQueue(
    activeMarker,
    selectedItemForPanel,
    artworkById,
    visibleArtworks,
    currentArtwork,
    preservedQueue
  )
}

/**
 * @param {Record<string, unknown>[]} queue
 * @param {Record<string, unknown> | null} artwork
 */
export function indexInPresentationQueue(queue, artwork) {
  if (!artwork || !Array.isArray(queue) || queue.length === 0) return 0
  const id = String(artwork.id ?? artwork.artwork_id ?? '')
  const idx = queue.findIndex((item) => String(item.id ?? item.artwork_id ?? '') === id)
  return idx >= 0 ? idx : 0
}
