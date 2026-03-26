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

const defaultClusterI18n = {
  artworksCount: (n) => `${n} artworks`,
  cityCount: (city, n) => (city ? `${city} (${n})` : `${n} artworks`),
  multipleArtists: 'Multiple artists',
  variousYears: 'Various years',
  multipleMuseums: 'Multiple museums',
  zoomExplore: (n) => `Zoom in to explore ${n} artworks in this area.`
}

function buildClusters(artworks, cellSize, limit, clusterI18n = defaultClusterI18n) {
  const i18n = { ...defaultClusterI18n, ...clusterI18n }
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

    // Derive user-friendly labels from the artworks inside the cluster.
    // Note: the App supplies already-localized `display*` fields for art objects.
    const isUnknownText = (v) => {
      const s = String(v ?? '').trim()
      if (!s) return true
      const low = s.toLowerCase()
      return low === 'unknown' || low === 'unknown artist' || low.includes('unknown')
    }

    const sortedClusterItems = [...items].sort((a, b) => rankByPriority(a, b, representative))

    const makeTopListString = (list, { maxItems = 3 } = {}) => {
      const filtered = list.filter((x) => x && !isUnknownText(x))
      const top = filtered.slice(0, maxItems)
      if (top.length === 0) return ''
      const base = top.join(', ')
      return filtered.length > maxItems ? `${base}...` : base
    }

    const cityCounts = new Map()
    const artistCounts = new Map()
    const museumCounts = new Map()

    const firstSeenIndex = new Map()

    sortedClusterItems.forEach((art, idx) => {
      const city = String(art?.displayCity ?? art?.current_location?.city ?? '').trim()
      if (city && !isUnknownText(city)) {
        cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1)
        if (!firstSeenIndex.has(`city:${city}`)) firstSeenIndex.set(`city:${city}`, idx)
      }

      const artist = String(art?.displayArtist ?? art?.artist ?? '').trim()
      if (artist && !isUnknownText(artist)) {
        artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1)
        if (!firstSeenIndex.has(`artist:${artist}`)) firstSeenIndex.set(`artist:${artist}`, idx)
      }

      const museum = String(
        art?.displayMuseumName ?? art?.museumName ?? art?.current_location?.museum ?? ''
      ).trim()
      if (museum && !isUnknownText(museum)) {
        museumCounts.set(museum, (museumCounts.get(museum) ?? 0) + 1)
        if (!firstSeenIndex.has(`museum:${museum}`)) firstSeenIndex.set(`museum:${museum}`, idx)
      }
    })

    const sortedByCount = (countsMap, prefix) =>
      [...countsMap.entries()].sort((a, b) => {
        const aCount = a[1] ?? 0
        const bCount = b[1] ?? 0
        if (bCount !== aCount) return bCount - aCount
        const aIdx = firstSeenIndex.get(`${prefix}:${a[0]}`) ?? Number.POSITIVE_INFINITY
        const bIdx = firstSeenIndex.get(`${prefix}:${b[0]}`) ?? Number.POSITIVE_INFINITY
        return aIdx - bIdx
      })

    const topCity = sortedByCount(cityCounts, 'city')[0]?.[0] ?? ''
    const topArtists = sortedByCount(artistCounts, 'artist').map((x) => x[0])
    const topMuseums = sortedByCount(museumCounts, 'museum').map((x) => x[0])

    // Anchor the visible globe pin to the same "topCity" we use in the cluster title.
    // Previously, we used the centroid of all bucket items, which could drift toward
    // neighboring cities when a bucket contains multiple cities.
    const topCityItems = topCity
      ? items.filter((art) => String(art?.displayCity ?? art?.current_location?.city ?? '').trim() === topCity)
      : []
    const latLngItems = topCityItems.length > 0 ? topCityItems : items
    const lat = latLngItems.reduce((sum, item) => sum + item.lat, 0) / latLngItems.length
    const lng = latLngItems.reduce((sum, item) => sum + item.lng, 0) / latLngItems.length

    // Title fallback chain:
    // 1) City (preferred)
    // 2) Museum (better than generic "N artworks" when city data is missing)
    // 3) Artwork count
    let title = i18n.artworksCount(items.length)
    if (topCity) title = i18n.cityCount(topCity, items.length)
    else if (topMuseums[0]) title = `${topMuseums[0]} (${items.length})`
    const artistLabel = makeTopListString(topArtists, { maxItems: 3 }) || i18n.multipleArtists
    const museumLabel = makeTopListString(topMuseums, { maxItems: 3 }) || i18n.multipleMuseums

    clusters.push({
      id: `cluster-${cellSize}-${key}-${items.length}`,
      title,
      artist: artistLabel,
      year: i18n.variousYears,
      lat,
      lng,
      imageUrl: representative?.imageUrl ?? '',
      description: i18n.zoomExplore(items.length),
      museumName: museumLabel,
      source: 'cluster',
      sourceUrl: '',
      isCluster: true,
      clusterCount: items.length,
      clusterItems: sortedClusterItems
    })
  }

  clusters.sort((a, b) => (b.clusterCount ?? 1) - (a.clusterCount ?? 1))
  return clusters.slice(0, limit)
}

export function resolveLodData(artworks, altitude, farCount = 80, clusterI18n) {
  if (!Array.isArray(artworks) || artworks.length === 0) return []
  const farLimit = clamp(farCount, 30, 180)
  const midLimit = clamp(Math.round(farCount * 1.8), 80, 260)

  const band = getZoomBand(altitude)
  if (band === 'far') return buildClusters(artworks, 20, farLimit, clusterI18n)
  if (band === 'mid') return buildClusters(artworks, 10, midLimit, clusterI18n)
  // `near`: avoid returning the entire dataset to prevent DOM/WebGL overload.
  // Preserve detail when the dataset is already small.
  const nearMaxArtifacts = clamp(Math.round(farCount * 2.6), 160, 320)
  if (artworks.length <= nearMaxArtifacts) return artworks
  const nearLimit = clamp(Math.round(farCount * 3.0), 180, 420)
  // Finer clustering than `mid`, but still bounded.
  return buildClusters(artworks, 6, nearLimit, clusterI18n)
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

  let focusPoint = null
  if (selectedItem && Number.isFinite(selectedItem.lat) && Number.isFinite(selectedItem.lng)) {
    focusPoint = { lat: selectedItem.lat, lng: selectedItem.lng }
  } else if (items.length > 0) {
    const sumLat = items.reduce((s, it) => s + (Number.isFinite(it.lat) ? it.lat : 0), 0)
    const sumLng = items.reduce((s, it) => s + (Number.isFinite(it.lng) ? it.lng : 0), 0)
    focusPoint = { lat: sumLat / items.length, lng: sumLng / items.length }
  }

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
