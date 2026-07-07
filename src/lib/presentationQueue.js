/**
 * Build ordered list of artworks for Present mode prev/next navigation.
 * @param {Record<string, unknown> | null} activeMarker
 * @param {Record<string, unknown> | null} selectedItemForPanel
 * @param {Map<string, Record<string, unknown>>} artworkById
 * @param {Record<string, unknown>[]} visibleArtworks
 * @param {Record<string, unknown> | null} currentArtwork
 */
export function buildPresentationQueue(
  activeMarker,
  selectedItemForPanel,
  artworkById,
  visibleArtworks,
  currentArtwork
) {
  if (!currentArtwork) return []

  const resolve = (art) => artworkById.get(String(art?.id ?? art?.artwork_id ?? '')) ?? art

  if (selectedItemForPanel?.isClusterPicker && Array.isArray(selectedItemForPanel.clusterArtworks)) {
    return selectedItemForPanel.clusterArtworks.map(resolve).filter(Boolean)
  }

  if (activeMarker?.isMuseumStack && Array.isArray(activeMarker.artworks)) {
    return activeMarker.artworks.map(resolve).filter(Boolean)
  }

  const flatVisible = (visibleArtworks ?? [])
    .filter((item) => !item.isCluster)
    .map(resolve)
    .filter(Boolean)

  if (flatVisible.length > 0) {
    const byTitle = [...flatVisible].sort((a, b) =>
      String(a.displayTitle ?? a.title ?? '').localeCompare(
        String(b.displayTitle ?? b.title ?? ''),
        undefined,
        { sensitivity: 'base' }
      )
    )
    const id = String(currentArtwork.id ?? currentArtwork.artwork_id ?? '')
    if (byTitle.some((a) => String(a.id) === id)) return byTitle
  }

  return [resolve(currentArtwork)].filter(Boolean)
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
