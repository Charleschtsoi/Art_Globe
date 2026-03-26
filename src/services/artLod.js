const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function getZoomBand(altitude) {
  if (altitude > 2.2) return 'far'
  if (altitude > 1.25) return 'mid'
  return 'near'
}

const toBucketKey = (lat, lng, cellSize) => {
  const latBucket = Math.floor((lat + 90) / cellSize)
  const lngBucket = Math.floor((lng + 180) / cellSize)
  return `${latBucket}:${lngBucket}`
}

const distanceScore = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const dLat = a.lat - b.lat
  const dLng = a.lng - b.lng
  return dLat * dLat + dLng * dLng
}

const stableIdScore = (item) => {
  const id = String(item?.id ?? '')
  let score = 0
  for (let i = 0; i < id.length; i += 1) {
    score = (score * 31 + id.charCodeAt(i)) % 1000003
  }
  return score
}

const rankByPriority = (a, b, focusPoint) => {
  const aDist = distanceScore(a, focusPoint)
  const bDist = distanceScore(b, focusPoint)
  if (aDist !== bDist) return aDist - bDist
  const aCluster = a.clusterCount ?? 1
  const bCluster = b.clusterCount ?? 1
  if (aCluster !== bCluster) return bCluster - aCluster
  return stableIdScore(a) - stableIdScore(b)
}

const pickRepresentative = (items) => items.find((item) => item.imageUrl) ?? items[0]

function buildClusters(artworks, cellSize, limit) {
  const buckets = new Map()
  for (const art of artworks) {
    const key = toBucketKey(art.lat, art.lng, cellSize)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(art)
  }

  const clusters = []
  for (const [key, items] of buckets.entries()) {
    if (items.length === 1) {
      clusters.push(items[0])
      continue
    }

    const representative = pickRepresentative(items)
    const lat = items.reduce((sum, item) => sum + item.lat, 0) / items.length
    const lng = items.reduce((sum, item) => sum + item.lng, 0) / items.length
    clusters.push({
      id: `cluster-${cellSize}-${key}-${items.length}`,
      title: `${items.length} artworks`,
      artist: 'Multiple artists',
      year: 'Various years',
      lat,
      lng,
      imageUrl: representative?.imageUrl ?? '',
      description: `Zoom in to explore ${items.length} artworks in this area.`,
      museumName: 'Multiple museums',
      source: 'cluster',
      sourceUrl: '',
      isCluster: true,
      clusterCount: items.length,
      clusterItems: [...items]
        .sort((a, b) => rankByPriority(a, b, representative))
        .slice(0, 3)
    })
  }

  clusters.sort((a, b) => (b.clusterCount ?? 1) - (a.clusterCount ?? 1))
  return clusters.slice(0, limit)
}

export function resolveLodData(artworks, altitude, farCount = 80) {
  if (!Array.isArray(artworks) || artworks.length === 0) return []
  const farLimit = clamp(farCount, 30, 180)
  const midLimit = clamp(Math.round(farCount * 1.8), 80, 260)

  const band = getZoomBand(altitude)
  if (band === 'far') return buildClusters(artworks, 20, farLimit)
  if (band === 'mid') return buildClusters(artworks, 10, midLimit)
  return artworks
}

export function resolveHtmlMarkerData(visibleItems, selectedItem, zoomBand) {
  const maxByBand = {
    far: 80,
    mid: 180,
    near: 360
  }
  const maxItems = maxByBand[zoomBand] ?? 100
  const items = visibleItems ?? []
  if (items.length <= maxItems) return items

  const fallbackFocus = items[0]
  const focusPoint = selectedItem
    ? { lat: selectedItem.lat, lng: selectedItem.lng }
    : fallbackFocus
      ? { lat: fallbackFocus.lat, lng: fallbackFocus.lng }
      : null

  const ordered = [...items].sort((a, b) => rankByPriority(a, b, focusPoint))
  const deduped = []
  const used = new Set()
  for (const item of ordered) {
    if (deduped.length >= maxItems) break
    if (used.has(item.id)) continue
    used.add(item.id)
    deduped.push(item)
  }
  return deduped
}
