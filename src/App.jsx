import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import artPlaceholder from './assets/art-placeholder.svg'
import ArtworkSidePanel from './components/ArtworkSidePanel'
import SearchBar from './components/SearchBar'
import { getZoomBand, resolveHtmlMarkerData, resolveLodData } from './services/artLod'
import { readStoredLocale, writeStoredLocale, translate } from './i18n/translations'
import { localizeArtworkDisplay } from './i18n/localizeArtworkDisplay'
import {
  classifyRegionForCoords,
  fetchChunkManifest,
  fetchChunkRecords,
  fetchSearchIndex,
  getChunkIdsForRegion
} from './services/runtimeDataLoader'

const MARKER_STYLE_TAG_ID = 'art-globe-marker-animations'

/** Equirectangular blue marble (react-globe.gl / three-globe); omitting globeImageUrl renders a black sphere per library docs. */
const EARTH_BLUE_MARBLE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const MIN_CAMERA_ALTITUDE = 0.55
const MAX_CAMERA_ALTITUDE = 6.2
const ZOOM_STEP_RATIO = 0.82
const ZOOM_BUTTON_ANIMATION_MS = 620
const HYDRATION_BATCH_SIZE = Number(import.meta.env.VITE_HYDRATION_BATCH_SIZE ?? 1)
const HYDRATION_BATCH_DELAY_MS = Number(import.meta.env.VITE_HYDRATION_BATCH_DELAY_MS ?? 220)

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const spreadOutArtworks = (data) => {
  const locationCounts = {}
  return data.map((art) => {
    const locKey = `${art.lat}-${art.lng}`
    if (!locationCounts[locKey]) locationCounts[locKey] = 0
    const count = locationCounts[locKey]
    locationCounts[locKey] += 1
    if (count === 0) return art
    const radius = 0.005 + count * 0.002
    const angle = count * 1.5
    return {
      ...art,
      lat: art.lat + radius * Math.cos(angle),
      lng: art.lng + radius * Math.sin(angle)
    }
  })
}

function App() {
  const [allArtworksBase, setAllArtworksBase] = useState([])
  const [searchRecords, setSearchRecords] = useState([])
  const [activeMarker, setActiveMarker] = useState(null)
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [clusterHint, setClusterHint] = useState('')
  const [cameraAltitude, setCameraAltitude] = useState(2.4)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [locale, setLocale] = useState(() => readStoredLocale())
  const globeRef = useRef(null)
  const controlsRef = useRef(null)
  const idleTimerRef = useRef(null)
  const clusterHintTimerRef = useRef(null)
  const zoomRafRef = useRef(null)
  const pendingAltitudeRef = useRef(2.4)
  const visualFxRef = useRef({
    cloudMesh: null,
    cloudGeometry: null,
    cloudMaterial: null,
    starField: null,
    starGeometry: null,
    starMaterial: null,
    starFieldFar: null,
    starGeometryFar: null,
    starMaterialFar: null,
    animationFrame: null,
    flyInTimer: null,
    initialized: false
  })
  const brokenImageUrlsRef = useRef(new Set())
  const loadedImageUrlsRef = useRef(new Set())
  const markerTelemetryRef = useRef({
    tierThumb: 0,
    tierPlaceholder: 0,
    thumbErrors: 0
  })
  const dataManifestRef = useRef(null)
  const loadedChunkIdsRef = useRef(new Set())
  const loadingChunkIdsRef = useRef(new Set())
  const currentPovRegionRef = useRef('asia')
  const hydrationTimerRef = useRef(null)

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale])

  const markerZoomBand = useMemo(() => getZoomBand(cameraAltitude), [cameraAltitude])
  const isMobileLayout = viewport.width <= 900
  const totalRecords = dataManifestRef.current?.totalRecords ?? allArtworksBase.length

  const periodFilteredArtworksBase = useMemo(() => {
    if (!selectedPeriods.length) return allArtworksBase
    const selected = new Set(selectedPeriods)
    return allArtworksBase.filter((art) => selected.has(String(art.time_period || art.timePeriod || 'unknown')))
  }, [allArtworksBase, selectedPeriods])

  const allArtworks = useMemo(
    () => periodFilteredArtworksBase.map((a) => localizeArtworkDisplay(a, locale)),
    [periodFilteredArtworksBase, locale]
  )

  const artworkById = useMemo(() => new Map(allArtworks.map((art) => [String(art.id), art])), [allArtworks])

  const loadChunksById = useCallback(async (chunkIds = []) => {
    const manifest = dataManifestRef.current
    if (!manifest?.chunks || chunkIds.length === 0) return []
    const pendingIds = chunkIds.filter(
      (id) => !loadedChunkIdsRef.current.has(id) && !loadingChunkIdsRef.current.has(id)
    )
    if (pendingIds.length === 0) return []
    for (const chunkId of pendingIds) loadingChunkIdsRef.current.add(chunkId)
    const chunkById = new Map(manifest.chunks.map((chunk) => [chunk.id, chunk]))
    const loaded = await Promise.all(
      pendingIds.map(async (chunkId) => {
        try {
          const chunk = chunkById.get(chunkId)
          if (!chunk?.path) return []
          const records = await fetchChunkRecords(chunk.path)
          loadedChunkIdsRef.current.add(chunkId)
          return records
        } finally {
          loadingChunkIdsRef.current.delete(chunkId)
        }
      })
    )
    const flat = loaded.flat()
    if (flat.length > 0) {
      setAllArtworksBase((prev) => {
        const next = [...prev]
        const known = new Set(prev.map((row) => String(row.id)))
        for (const row of flat) {
          const id = String(row.id ?? row.artwork_id ?? '')
          if (!id || known.has(id)) continue
          known.add(id)
          next.push(row)
        }
        return next
      })
    }
    return flat
  }, [])

  const startProgressiveGlobalHydration = useCallback(() => {
    const manifest = dataManifestRef.current
    if (!manifest?.chunks?.length) return
    const currentRegion = currentPovRegionRef.current
    const chunks = manifest.chunks
    const prioritized = [
      ...chunks.filter((chunk) => chunk.region === currentRegion),
      ...chunks.filter((chunk) => chunk.region !== currentRegion)
    ].map((chunk) => chunk.id)
    let cursor = 0

    const tick = async () => {
      if (cursor >= prioritized.length) return
      const nextIds = prioritized.slice(cursor, cursor + HYDRATION_BATCH_SIZE)
      cursor += HYDRATION_BATCH_SIZE
      try {
        await loadChunksById(nextIds)
      } catch (error) {
        console.warn('Global hydration batch failed:', error)
      }
      hydrationTimerRef.current = window.setTimeout(tick, HYDRATION_BATCH_DELAY_MS)
    }
    hydrationTimerRef.current = window.setTimeout(tick, HYDRATION_BATCH_DELAY_MS)
  }, [loadChunksById])

  useEffect(() => {
    let disposed = false
    const bootstrapData = async () => {
      try {
        const [manifest, search] = await Promise.all([fetchChunkManifest(), fetchSearchIndex()])
        if (disposed) return
        dataManifestRef.current = manifest
        setSearchRecords(Array.isArray(search?.records) ? search.records : [])
        const initialChunkIds = getChunkIdsForRegion(manifest, currentPovRegionRef.current, 3)
        await loadChunksById(initialChunkIds)
        startProgressiveGlobalHydration()
      } catch (error) {
        console.error('Runtime data bootstrap failed:', error)
      }
    }
    bootstrapData()
    return () => {
      disposed = true
      if (hydrationTimerRef.current) window.clearTimeout(hydrationTimerRef.current)
    }
  }, [loadChunksById, startProgressiveGlobalHydration])

  const maybePreloadRegion = useCallback(
    (lat, lng, altitude) => {
      const manifest = dataManifestRef.current
      if (!manifest) return
      const region = classifyRegionForCoords(lat, lng)
      currentPovRegionRef.current = region
      const count = altitude > 1.5 ? 2 : 4
      const candidateChunkIds = getChunkIdsForRegion(manifest, region, count)
      loadChunksById(candidateChunkIds).catch((error) => {
        console.warn('Chunk preload failed:', error)
      })
    },
    [loadChunksById]
  )

  useEffect(() => {
    writeStoredLocale(locale)
    document.documentElement.lang = locale === 'zhHant' ? 'zh-Hant' : 'en'
  }, [locale])

  const clusterI18n = useMemo(
    () => ({
      artworksCount: (n) => t('cluster.artworksCount', { count: n }),
      cityCount: (city, n) => t('cluster.cityCount', { city, count: n }),
      multipleArtists: t('cluster.multipleArtists'),
      variousYears: t('cluster.variousYears'),
      multipleMuseums: t('cluster.multipleMuseums'),
      zoomExplore: (n) => t('cluster.zoomExplore', { count: n })
    }),
    [t]
  )

  const jitteredArtworks = useMemo(() => spreadOutArtworks(allArtworks), [allArtworks])
  const visibleArtworks = useMemo(
    () => resolveLodData(jitteredArtworks, cameraAltitude, 80, clusterI18n),
    [jitteredArtworks, cameraAltitude, clusterI18n]
  )
  const htmlMarkerData = useMemo(
    () => resolveHtmlMarkerData(visibleArtworks, activeMarker, markerZoomBand),
    [visibleArtworks, activeMarker, markerZoomBand]
  )
  const datasetStats = useMemo(() => {
    const periodCounts = new Map()
    for (const art of allArtworksBase) {
      const period = String(art.time_period || art.timePeriod || 'unknown')
      periodCounts.set(period, (periodCounts.get(period) || 0) + 1)
    }
    const sortedEntries = (map, limit = 4) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
    return {
      loadedTotal: allArtworksBase.length,
      visible: periodFilteredArtworksBase.length,
      total: totalRecords,
      periods: sortedEntries(periodCounts, 12)
    }
  }, [allArtworksBase, periodFilteredArtworksBase.length, totalRecords])

  const selectedItemForPanel = useMemo(() => {
    if (!activeMarker) return null
    if (activeMarker.isCluster) {
      const items = Array.isArray(activeMarker.clusterItems) ? activeMarker.clusterItems : []
      const clusterArtworks = items
        .map((entry) => artworkById.get(String(entry.id)) ?? entry)
        .filter(Boolean)
      return {
        isClusterPicker: true,
        clusterId: activeMarker.id,
        clusterCount: activeMarker.clusterCount ?? clusterArtworks.length,
        clusterArtworks
      }
    }
    if (activeMarker.isMuseumStack) {
      return {
        ...activeMarker,
        artworks: activeMarker.artworks
          ?.map((item) => artworkById.get(String(item.id)) ?? item)
          .filter(Boolean)
      }
    }
    return artworkById.get(String(activeMarker.id)) ?? activeMarker
  }, [activeMarker, artworkById])

  const scheduleAutoRotateResume = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = false
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      if (!selectedItemForPanel) controls.autoRotate = true
    }, 3000)
  }, [selectedItemForPanel])
  const pauseAutoRotate = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = false
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
  }, [])

  useEffect(() => {
    if (document.getElementById(MARKER_STYLE_TAG_ID)) return
    const styleTag = document.createElement('style')
    styleTag.id = MARKER_STYLE_TAG_ID
    styleTag.textContent = `
      @keyframes artMarkerPulseArtwork {
        0% { box-shadow: 0 2px 9px rgba(0, 0, 0, 0.33), 0 0 0 0 rgba(212, 168, 83, 0.30); }
        70% { box-shadow: 0 3px 12px rgba(0, 0, 0, 0.38), 0 0 0 7px rgba(212, 168, 83, 0); }
        100% { box-shadow: 0 2px 9px rgba(0, 0, 0, 0.33), 0 0 0 0 rgba(212, 168, 83, 0); }
      }
      @keyframes artMarkerPulseCluster {
        0% { box-shadow: 0 2px 9px rgba(0, 0, 0, 0.33), 0 0 0 0 rgba(212, 168, 83, 0.26); }
        70% { box-shadow: 0 3px 12px rgba(0, 0, 0, 0.38), 0 0 0 8px rgba(212, 168, 83, 0); }
        100% { box-shadow: 0 2px 9px rgba(0, 0, 0, 0.33), 0 0 0 0 rgba(212, 168, 83, 0); }
      }
      @keyframes artMarkerImageLoading {
        0% { filter: brightness(0.95); }
        50% { filter: brightness(1.08); }
        100% { filter: brightness(0.95); }
      }
      .art-marker-pin {
        transform-origin: center;
      }
      .art-marker-pin--artwork {
        animation: artMarkerPulseArtwork 2.7s ease-in-out infinite;
      }
      .art-marker-pin--cluster {
        animation: artMarkerPulseCluster 2.4s ease-in-out infinite;
      }
      .art-marker-pin--loading {
        animation:
          artMarkerPulseArtwork 2.7s ease-in-out infinite,
          artMarkerImageLoading 1.2s ease-in-out infinite;
      }
      .art-marker-pin--cluster.art-marker-pin--loading {
        animation:
          artMarkerPulseCluster 2.4s ease-in-out infinite,
          artMarkerImageLoading 1.2s ease-in-out infinite;
      }
    `
    document.head.appendChild(styleTag)
    return () => styleTag.remove()
  }, [])

  const buildCloudTexture = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < 110; i += 1) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      const radius = 20 + Math.random() * 75
      const gradient = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius)
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.16)')
      gradient.addColorStop(0.45, 'rgba(240, 240, 240, 0.08)')
      gradient.addColorStop(1, 'rgba(230, 230, 230, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
  }, [])

  const onGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls?.()
    if (!controls) return
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.16
    controls.enablePan = false
    controlsRef.current = controls
    controls.addEventListener('start', scheduleAutoRotateResume)
    controls.addEventListener('change', scheduleAutoRotateResume)
    controls.addEventListener('end', scheduleAutoRotateResume)

    const globe = globeRef.current
    globe?.pointOfView({ lat: 24, lng: 90, altitude: 6 }, 0)
    maybePreloadRegion(24, 90, 6)
    if (visualFxRef.current.flyInTimer) window.clearTimeout(visualFxRef.current.flyInTimer)
    visualFxRef.current.flyInTimer = window.setTimeout(() => {
      globe?.pointOfView({ lat: 24, lng: 90, altitude: 2.4 }, 2500)
      maybePreloadRegion(24, 90, 2.4)
    }, 140)

    if (visualFxRef.current.initialized) return
    visualFxRef.current.initialized = true
    const scene = globe?.scene?.()
    const globeRadius = globe?.getGlobeRadius?.()
    if (!scene || typeof globeRadius !== 'number') return

    const cloudGeometry = new THREE.SphereGeometry(globeRadius * 1.008, 72, 72)
    const cloudMaterial = new THREE.MeshPhongMaterial({
      map: buildCloudTexture(),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial)
    cloudMesh.renderOrder = 2
    scene.add(cloudMesh)

    const starCount = 1300
    const positions = new Float32Array(starCount * 3)
    const starRadius = globeRadius * 10.5
    for (let i = 0; i < starCount; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const x = starRadius * Math.sin(phi) * Math.cos(theta)
      const y = starRadius * Math.sin(phi) * Math.sin(theta)
      const z = starRadius * Math.cos(phi)
      const offset = i * 3
      positions[offset] = x
      positions[offset + 1] = y
      positions[offset + 2] = z
    }

    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: '#eaf2ff',
      size: globeRadius * 0.0085,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
    const starField = new THREE.Points(starGeometry, starMaterial)
    scene.add(starField)

    const farStarCount = 700
    const farPositions = new Float32Array(farStarCount * 3)
    const farStarRadius = globeRadius * 13.5
    for (let i = 0; i < farStarCount; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const x = farStarRadius * Math.sin(phi) * Math.cos(theta)
      const y = farStarRadius * Math.sin(phi) * Math.sin(theta)
      const z = farStarRadius * Math.cos(phi)
      const offset = i * 3
      farPositions[offset] = x
      farPositions[offset + 1] = y
      farPositions[offset + 2] = z
    }
    const starGeometryFar = new THREE.BufferGeometry()
    starGeometryFar.setAttribute('position', new THREE.BufferAttribute(farPositions, 3))
    const starMaterialFar = new THREE.PointsMaterial({
      color: '#c6dbff',
      size: globeRadius * 0.0058,
      transparent: true,
      opacity: 0.33,
      depthWrite: false
    })
    const starFieldFar = new THREE.Points(starGeometryFar, starMaterialFar)
    scene.add(starFieldFar)

    const neutralAmbient = new THREE.AmbientLight('#ffffff', 0.55)
    const sunKey = new THREE.DirectionalLight('#fffaf0', 0.85)
    sunKey.position.set(1.25, 0.85, 0.45)
    const coolFill = new THREE.DirectionalLight('#e8eeff', 0.3)
    coolFill.position.set(-0.6, 0.2, -0.85)
    globe?.lights?.([neutralAmbient, sunKey, coolFill])

    const animate = () => {
      cloudMesh.rotation.y += 0.00014
      starField.rotation.y += 0.00005
      starFieldFar.rotation.y += 0.000018
      visualFxRef.current.animationFrame = window.requestAnimationFrame(animate)
    }
    visualFxRef.current.cloudMesh = cloudMesh
    visualFxRef.current.cloudGeometry = cloudGeometry
    visualFxRef.current.cloudMaterial = cloudMaterial
    visualFxRef.current.starField = starField
    visualFxRef.current.starGeometry = starGeometry
    visualFxRef.current.starMaterial = starMaterial
    visualFxRef.current.starFieldFar = starFieldFar
    visualFxRef.current.starGeometryFar = starGeometryFar
    visualFxRef.current.starMaterialFar = starMaterialFar
    visualFxRef.current.animationFrame = window.requestAnimationFrame(animate)
  }, [buildCloudTexture, maybePreloadRegion, scheduleAutoRotateResume])

  useEffect(() => {
    const controls = controlsRef.current
    if (controls) controls.autoRotate = !selectedItemForPanel
  }, [selectedItemForPanel])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(
    () => () => {
      if (zoomRafRef.current) window.cancelAnimationFrame(zoomRafRef.current)
      const controls = controlsRef.current
      if (controls) {
        controls.removeEventListener('start', scheduleAutoRotateResume)
        controls.removeEventListener('change', scheduleAutoRotateResume)
        controls.removeEventListener('end', scheduleAutoRotateResume)
      }
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      if (clusterHintTimerRef.current) window.clearTimeout(clusterHintTimerRef.current)
      if (hydrationTimerRef.current) window.clearTimeout(hydrationTimerRef.current)
      const visualFx = visualFxRef.current
      if (visualFx.flyInTimer) window.clearTimeout(visualFx.flyInTimer)
      if (visualFx.animationFrame) window.cancelAnimationFrame(visualFx.animationFrame)
      const scene = globeRef.current?.scene?.()
      if (scene && visualFx.cloudMesh) scene.remove(visualFx.cloudMesh)
      if (scene && visualFx.starField) scene.remove(visualFx.starField)
      if (scene && visualFx.starFieldFar) scene.remove(visualFx.starFieldFar)
      visualFx.cloudGeometry?.dispose()
      visualFx.cloudMaterial?.dispose()
      visualFx.starGeometry?.dispose()
      visualFx.starMaterial?.dispose()
      visualFx.starGeometryFar?.dispose()
      visualFx.starMaterialFar?.dispose()
      visualFxRef.current = {
        cloudMesh: null,
        cloudGeometry: null,
        cloudMaterial: null,
        starField: null,
        starGeometry: null,
        starMaterial: null,
        starFieldFar: null,
        starGeometryFar: null,
        starMaterialFar: null,
        animationFrame: null,
        flyInTimer: null,
        initialized: false
      }
    },
    [scheduleAutoRotateResume]
  )

  const getMarkerImageUrl = useCallback((url) => {
    if (!url) return artPlaceholder
    const httpsUrl = url.replace(/^http:\/\//i, 'https://')
    if (httpsUrl.includes('/iiif/2/') && httpsUrl.includes('/full/')) {
      return httpsUrl.replace(/\/full\/\d+,\/0\/default\.jpg$/i, '/full/256,/0/default.jpg')
    }
    if (httpsUrl.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
      try {
        const parsed = new URL(httpsUrl)
        parsed.searchParams.set('width', '256')
        return parsed.toString()
      } catch {
        return httpsUrl.includes('?')
          ? httpsUrl.replace(/([?&])width=\d+/i, '$1width=256')
          : `${httpsUrl}?width=256`
      }
    }
    return httpsUrl.replace(/\/\d+px-/i, '/256px-')
  }, [])

  const trackMarkerTelemetry = useCallback((key) => {
    if (!import.meta.env.DEV) return
    const counters = markerTelemetryRef.current
    counters[key] = (counters[key] ?? 0) + 1
    window.__ART_MARKER_TELEMETRY__ = { ...counters }
  }, [])

  const focusOnArtwork = useCallback((art, nextAltitude = 1.1) => {
    if (typeof art?.lat !== 'number' || typeof art?.lng !== 'number') return
    globeRef.current?.pointOfView({ lat: art.lat, lng: art.lng, altitude: nextAltitude }, 1000)
  }, [])

  const getZoomInAltitude = useCallback((currentAltitude) => {
    const current = Number(currentAltitude)
    if (!Number.isFinite(current)) return 1.1
    // Keep click-focus monotonic: never move to a farther altitude.
    const target = Math.max(0.6, current * 0.82)
    return Math.min(current, target)
  }, [])

  const handleGlobalSearchSelect = useCallback(
    async (art) => {
      if (!art) return
      const chunkId = typeof art.chunkId === 'string' ? art.chunkId : null
      if (chunkId) {
        try {
          await loadChunksById([chunkId])
        } catch (error) {
          console.warn('Search chunk lazy-load failed:', error)
        }
      }
      const resolved = artworkById.get(String(art.id)) ?? art
      const period = String(resolved.time_period || resolved.timePeriod || 'unknown')
      if (selectedPeriods.length > 0 && !selectedPeriods.includes(period)) {
        setSelectedPeriods((prev) => [...new Set([...prev, period])])
      }
      pauseAutoRotate()
      scheduleAutoRotateResume()
      setClusterHint('')
      setActiveMarker(resolved)
      focusOnArtwork(resolved, getZoomInAltitude(cameraAltitude))
    },
    [
      artworkById,
      cameraAltitude,
      focusOnArtwork,
      getZoomInAltitude,
      loadChunksById,
      pauseAutoRotate,
      scheduleAutoRotateResume,
      selectedPeriods
    ]
  )

  const handlePointClick = useCallback(
    (point) => {
      if (!point) return
      pauseAutoRotate()
      scheduleAutoRotateResume()
      if (point.isCluster) {
        setClusterHint('')
        setActiveMarker(point)
        return
      }
      setClusterHint('')
      setActiveMarker(point)
    },
    [pauseAutoRotate, scheduleAutoRotateResume]
  )

  const handleZoom = useCallback(({ altitude }) => {
    pendingAltitudeRef.current = altitude
    if (zoomRafRef.current) return
    zoomRafRef.current = window.requestAnimationFrame(() => {
      setCameraAltitude(pendingAltitudeRef.current)
      const pov = globeRef.current?.pointOfView?.()
      if (pov) maybePreloadRegion(pov.lat, pov.lng, pendingAltitudeRef.current)
      zoomRafRef.current = null
    })
  }, [maybePreloadRegion])

  const handleZoomInClick = useCallback(() => {
    if (!Number.isFinite(cameraAltitude)) return
    pauseAutoRotate()
    scheduleAutoRotateResume()
    const nextAltitude = Math.max(MIN_CAMERA_ALTITUDE, cameraAltitude * ZOOM_STEP_RATIO)
    const targetAltitude = Math.min(cameraAltitude, nextAltitude)
    globeRef.current?.pointOfView({ altitude: targetAltitude }, ZOOM_BUTTON_ANIMATION_MS)
    // Keep LOD state in sync even if onZoom callbacks are throttled/late.
    setCameraAltitude(targetAltitude)
    const pov = globeRef.current?.pointOfView?.()
    if (pov) maybePreloadRegion(pov.lat, pov.lng, targetAltitude)
  }, [cameraAltitude, maybePreloadRegion, pauseAutoRotate, scheduleAutoRotateResume])

  const handleZoomOutClick = useCallback(() => {
    if (!Number.isFinite(cameraAltitude)) return
    pauseAutoRotate()
    scheduleAutoRotateResume()
    const nextAltitude = Math.min(MAX_CAMERA_ALTITUDE, cameraAltitude / ZOOM_STEP_RATIO)
    globeRef.current?.pointOfView({ altitude: nextAltitude }, ZOOM_BUTTON_ANIMATION_MS)
    // Keep LOD state in sync even if onZoom callbacks are throttled/late.
    setCameraAltitude(nextAltitude)
    const pov = globeRef.current?.pointOfView?.()
    if (pov) maybePreloadRegion(pov.lat, pov.lng, nextAltitude)
  }, [cameraAltitude, maybePreloadRegion, pauseAutoRotate, scheduleAutoRotateResume])

  useEffect(() => {
    if (!activeMarker) return
    if (activeMarker.isCluster || activeMarker.isMuseumStack) {
      setActiveMarker(null)
      return
    }
    const id = String(activeMarker.id ?? '')
    if (!id) return
    if (!artworkById.has(id)) setActiveMarker(null)
  }, [activeMarker, artworkById])

  const createArtworkElement = useCallback(
    (art) => {
      const artworkTitle = art.displayTitle ?? art.title
      const cardArtist = art.displayArtist ?? art.artist
      const cardMuseum = art.displayMuseumName ?? art.museumName ?? ''
      const cityName = art.isCluster ? '' : (art.displayCity ?? art.current_location?.city ?? '')
      const cardTitle = art.isCluster ? artworkTitle : (cityName || artworkTitle)
      const rawImageUrl = typeof art?.imageUrl === 'string' ? art.imageUrl.trim() : ''
      const size = markerZoomBand === 'far' ? 26 : markerZoomBand === 'mid' ? 34 : 40
      const wrapper = document.createElement('div')
      wrapper.dataset.artId = String(art.id ?? '')
      wrapper.dataset.isCluster = art.isCluster ? 'true' : 'false'
      // The wrapper is the "pill pillar" anchor box. Keeping it the same size as the
      // thumbnail ensures the city's pillar stays visually aligned with the circle.
      wrapper.style.width = `${size}px`
      wrapper.style.height = `${size}px`
      wrapper.style.overflow = 'visible'
      wrapper.style.position = 'relative'
      wrapper.style.display = 'flex'
      wrapper.style.alignItems = 'flex-start'
      wrapper.style.justifyContent = 'flex-start'
      wrapper.style.pointerEvents = 'none'
      wrapper.style.transform = 'translate(0px, 0px)'

      const pin = document.createElement('button')
      pin.type = 'button'
      pin.setAttribute(
        'aria-label',
        art.isCluster
          ? t('marker.clusterAria', { count: art.clusterCount ?? 0 })
          : t('marker.artworkAria', { title: artworkTitle, artist: cardArtist })
      )
      pin.style.width = `${size}px`
      pin.style.height = `${size}px`
      pin.style.borderRadius = '50%'
      pin.style.overflow = 'hidden'
      pin.style.background = '#f5e6c8'
      pin.style.border = '2px solid rgba(212, 168, 83, 0.85)'
      pin.style.boxShadow = '0 2px 9px rgba(0, 0, 0, 0.33)'
      pin.style.transition = 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease'
      pin.style.padding = '0'
      pin.style.cursor = 'pointer'
      pin.style.pointerEvents = 'auto'
      pin.style.position = 'absolute'
      // Center the circle inside the wrapper anchor box.
      pin.style.top = '0px'
      pin.style.left = '0px'
      pin.style.zIndex = '5'
      pin.className = art.isCluster ? 'art-marker-pin art-marker-pin--cluster' : 'art-marker-pin art-marker-pin--artwork'

      const image = document.createElement('img')
      image.crossOrigin = 'anonymous'
      const canonicalImageUrl = typeof art?.canonicalImageUrl === 'string' ? art.canonicalImageUrl.trim() : ''
      const resolvedSource = canonicalImageUrl || rawImageUrl
      const thumbSrc = getMarkerImageUrl(resolvedSource)
      const isKnownBroken = Boolean(
        rawImageUrl && (brokenImageUrlsRef.current.has(rawImageUrl) || brokenImageUrlsRef.current.has(thumbSrc))
      )
      const isKnownLoaded = Boolean(thumbSrc && loadedImageUrlsRef.current.has(thumbSrc))
      const setLoadingState = (state) => {
        if (state === 'loading') pin.classList.add('art-marker-pin--loading')
        else pin.classList.remove('art-marker-pin--loading')
      }

      const setImageTier = (tier, nextSrc) => {
        image.dataset.fallbackTier = tier
        image.src = nextSrc
        if (tier === 'thumb') trackMarkerTelemetry('tierThumb')
        else if (tier === 'placeholder') trackMarkerTelemetry('tierPlaceholder')
      }
      image.alt = t('marker.artworkAria', { title: artworkTitle, artist: cardArtist })
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'cover'
      image.style.opacity = '0'
      image.style.transition = 'opacity 0.18s ease'

      if (isKnownBroken || !thumbSrc) {
        setLoadingState('failed')
        setImageTier('placeholder', artPlaceholder)
        image.style.opacity = '1'
      } else if (isKnownLoaded) {
        setLoadingState('loaded')
        setImageTier('thumb', thumbSrc)
        image.style.opacity = '1'
      } else {
        setLoadingState('loading')
        setImageTier('thumb', thumbSrc)
      }

      image.onload = () => {
        if (image.dataset.fallbackTier === 'thumb') {
          loadedImageUrlsRef.current.add(thumbSrc)
          setLoadingState('loaded')
        }
        image.style.opacity = '1'
      }
      image.onerror = () => {
        trackMarkerTelemetry('thumbErrors')
        if (rawImageUrl) brokenImageUrlsRef.current.add(rawImageUrl)
        if (thumbSrc) brokenImageUrlsRef.current.add(thumbSrc)
        image.onerror = null
        image.onload = null
        setLoadingState('failed')
        setImageTier('placeholder', artPlaceholder)
        image.style.opacity = '1'
      }
      pin.appendChild(image)
      wrapper.appendChild(pin)

      const miniCard = document.createElement('button')
      miniCard.type = 'button'
      miniCard.style.position = 'absolute'
      miniCard.style.left = `${size + 16}px`
      // Vertically center the card relative to the circle thumbnail.
      miniCard.style.top = `${size / 2}px`
      miniCard.style.transform = 'translateY(-50%)'
      miniCard.style.width = '132px'
      miniCard.style.maxWidth = '132px'
      // Semi-transparent default so the globe remains visible behind the info card.
      miniCard.style.backgroundColor = 'rgba(42, 28, 18, 0.55)'
      miniCard.style.border = '1px solid rgba(212, 168, 83, 0.28)'
      miniCard.style.opacity = '0.80'
      miniCard.style.borderRadius = '8px'
      miniCard.style.padding = '6px 7px'
      miniCard.style.color = '#f5e6c8'
      miniCard.style.textAlign = 'left'
      miniCard.style.pointerEvents = 'auto'
      miniCard.style.cursor = 'pointer'
      miniCard.style.zIndex = '4'
      miniCard.style.boxShadow = '0 4px 10px rgba(0,0,0,0.18)'
      miniCard.style.transition =
        'opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease'
      miniCard.innerHTML = `<span style="display:block;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(cardTitle)}</span>
<span style="display:block;font-size:10px;color:#c4a882;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(cardArtist)}</span>
<span style="display:block;font-size:10px;color:#d4a853;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(cardMuseum)}</span>`
      miniCard.setAttribute(
        'aria-label',
        art.isCluster
          ? t('marker.openClusterAria', { count: art.clusterCount ?? 0 })
          : t('marker.openArtwork', { title: artworkTitle })
      )
      wrapper.appendChild(miniCard)

      const onHoverIn = () => {
        pin.style.transform = 'scale(1.12)'
        pin.style.borderColor = '#d4a853'
        pin.style.boxShadow = '0 0 14px 4px rgba(212, 168, 83, 0.45)'

        miniCard.style.backgroundColor = 'rgba(42, 28, 18, 0.92)'
        miniCard.style.border = '1px solid rgba(212, 168, 83, 0.4)'
        miniCard.style.opacity = '1'
        miniCard.style.boxShadow = '0 4px 10px rgba(0,0,0,0.28)'
      }
      const onHoverOut = () => {
        pin.style.transform = 'scale(1)'
        pin.style.borderColor = 'rgba(212, 168, 83, 0.85)'
        pin.style.boxShadow = ''

        miniCard.style.backgroundColor = 'rgba(42, 28, 18, 0.55)'
        miniCard.style.border = '1px solid rgba(212, 168, 83, 0.28)'
        miniCard.style.opacity = '0.80'
        miniCard.style.boxShadow = '0 4px 10px rgba(0,0,0,0.18)'
      }
      const triggerOpen = (event) => {
        event.stopPropagation()
        handlePointClick(art)
      }
      pin.addEventListener('mouseenter', onHoverIn)
      pin.addEventListener('mouseleave', onHoverOut)
      miniCard.addEventListener('mouseenter', onHoverIn)
      miniCard.addEventListener('mouseleave', onHoverOut)
      pin.addEventListener('click', triggerOpen)
      miniCard.addEventListener('click', triggerOpen)
      return wrapper
    },
    [getMarkerImageUrl, handlePointClick, markerZoomBand, trackMarkerTelemetry, t]
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background:
          'radial-gradient(ellipse 125% 95% at 50% 32%, #101a3b 0%, #0a1230 26%, #090f24 52%, #060916 76%, #04050f 100%)',
        overflow: 'hidden',
        fontFamily:
          "'Playfair Display', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', Georgia, 'Times New Roman', serif"
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: isMobileLayout ? 'auto' : 12,
          left: 12,
          bottom: isMobileLayout ? 12 : 'auto',
          transform: 'none',
          zIndex: 90,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          width: isMobileLayout ? 'min(360px, calc(100vw - 24px))' : 'min(340px, calc(100vw - 24px))',
          pointerEvents: 'auto'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(32, 22, 14, 0.92)',
            border: '1px solid rgba(212, 168, 83, 0.35)',
            borderRadius: 10,
            padding: '6px 10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
          }}
        >
          <span style={{ fontSize: 12, color: '#a08060' }}>{t('lang.switch')}</span>
          <button
            type="button"
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            style={{
              border: locale === 'en' ? '1px solid #d4a853' : '1px solid rgba(212, 168, 83, 0.3)',
              background: locale === 'en' ? 'rgba(58, 36, 21, 0.9)' : 'rgba(42, 28, 18, 0.75)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            {t('lang.en')}
          </button>
          <button
            type="button"
            onClick={() => setLocale('zhHant')}
            aria-pressed={locale === 'zhHant'}
            style={{
              border: locale === 'zhHant' ? '1px solid #d4a853' : '1px solid rgba(212, 168, 83, 0.3)',
              background: locale === 'zhHant' ? 'rgba(58, 36, 21, 0.9)' : 'rgba(42, 28, 18, 0.75)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            {t('lang.zhHant')}
          </button>
        </div>
        <SearchBar
          artworks={allArtworks}
          searchRecords={selectedPeriods.length ? null : searchRecords}
          onSelectArtwork={handleGlobalSearchSelect}
          getThumbUrl={getMarkerImageUrl}
          t={t}
        />
      </div>
      <div
        onMouseEnter={pauseAutoRotate}
        onMouseLeave={scheduleAutoRotateResume}
        onMouseDown={pauseAutoRotate}
        onMouseUp={scheduleAutoRotateResume}
      >
        <Globe
          ref={globeRef}
          width={viewport.width}
          height={viewport.height}
          backgroundColor="#000008"
          showAtmosphere={true}
          atmosphereColor="rgba(100, 160, 255, 0.45)"
          atmosphereAltitude={0.18}
          globeImageUrl={EARTH_BLUE_MARBLE_URL}
          pointsData={visibleArtworks}
          pointLat="lat"
          pointLng="lng"
          pointColor={(item) => (item.isCluster ? '#d4a853' : '#f5e6c8')}
          pointAltitude={(item) => (item.isCluster ? 0.016 : 0.006)}
          pointRadius={(item) => (item.isCluster ? 0.2 : 0.1)}
          pointsMerge={true}
          htmlElementsData={htmlMarkerData}
          htmlElement={createArtworkElement}
          onZoom={handleZoom}
          onGlobeReady={onGlobeReady}
        />
      </div>
      <div
        style={{
          position: 'fixed',
          right: 14,
          bottom: isMobileLayout ? 156 : selectedItemForPanel ? 22 : 16,
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto'
        }}
      >
        <button
          type="button"
          aria-label={t('controls.zoomInAria')}
          onClick={handleZoomInClick}
          disabled={!Number.isFinite(cameraAltitude) || cameraAltitude <= MIN_CAMERA_ALTITUDE + 0.01}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid rgba(212, 168, 83, 0.45)',
            background: 'rgba(32, 22, 14, 0.92)',
            color: '#f5e6c8',
            fontSize: 24,
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label={t('controls.zoomOutAria')}
          onClick={handleZoomOutClick}
          disabled={!Number.isFinite(cameraAltitude) || cameraAltitude >= MAX_CAMERA_ALTITUDE - 0.01}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid rgba(212, 168, 83, 0.45)',
            background: 'rgba(32, 22, 14, 0.92)',
            color: '#f5e6c8',
            fontSize: 24,
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
          }}
        >
          -
        </button>
      </div>
      <div
        style={{
          position: 'fixed',
          left: 12,
          bottom: isMobileLayout ? 86 : 12,
          zIndex: 94,
          width: isMobileLayout ? 'min(220px, calc(100vw - 24px))' : 250,
          background: 'rgba(32, 22, 14, 0.88)',
          border: '1px solid rgba(212, 168, 83, 0.3)',
          borderRadius: 10,
          color: '#f5e6c8',
          padding: '8px 9px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
          pointerEvents: 'auto'
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{t('stats.periodFilterTitle')}</div>
        <div style={{ fontSize: 10, color: '#d9c4a1', marginBottom: 6 }}>
          {t('stats.visible')}: {datasetStats.visible.toLocaleString()} / {datasetStats.total.toLocaleString()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: '#e7d9c4' }}>
            {t('stats.byPeriod')} ({selectedPeriods.length})
          </div>
          <button
            type="button"
            onClick={() => setSelectedPeriods([])}
            disabled={selectedPeriods.length === 0}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.72)',
              color: '#f5e6c8',
              opacity: selectedPeriods.length === 0 ? 0.45 : 1,
              borderRadius: 7,
              padding: '2px 6px',
              fontSize: 10,
              cursor: selectedPeriods.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {t('stats.clear')}
          </button>
        </div>
        <div
          style={{
            maxHeight: isMobileLayout ? 98 : 116,
            overflowY: 'auto',
            border: '1px solid rgba(212, 168, 83, 0.18)',
            borderRadius: 8,
            background: 'rgba(18, 12, 8, 0.52)',
            padding: 3
          }}
        >
          {datasetStats.periods.map(([name, count]) => (
            <button
              key={`period-${name}`}
              type="button"
              onClick={() =>
                setSelectedPeriods((prev) =>
                  prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
                )
              }
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                fontSize: 10,
                color: '#c8aa80',
                background: selectedPeriods.includes(name) ? 'rgba(212, 168, 83, 0.2)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                padding: '5px'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    border: '1px solid rgba(212, 168, 83, 0.55)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    color: '#f5e6c8',
                    background: selectedPeriods.includes(name) ? 'rgba(212, 168, 83, 0.28)' : 'transparent'
                  }}
                >
                  {selectedPeriods.includes(name) ? '✓' : ''}
                </span>
                <span style={{ textTransform: 'capitalize' }}>
                  {t(`period.${name}`) === `period.${name}` ? name.replaceAll('_', ' ') : t(`period.${name}`)}
                </span>
              </span>
              <span>{count.toLocaleString()}</span>
            </button>
          ))}
        </div>
        {selectedPeriods.length > 0 && datasetStats.visible === 0 && (
          <div style={{ fontSize: 10, color: '#b79d78', marginTop: 6 }}>{t('stats.empty')}</div>
        )}
      </div>
      {selectedItemForPanel && activeMarker && (
        <ArtworkSidePanel
          key={
            activeMarker.isCluster
              ? `cluster-${activeMarker.id}`
              : String(activeMarker.id ?? activeMarker.artwork_id ?? 'panel')
          }
          item={selectedItemForPanel}
          onClose={() => setActiveMarker(null)}
          onSelectArtwork={(art) => {
            setActiveMarker(art)
            focusOnArtwork(art, getZoomInAltitude(cameraAltitude))
          }}
          getThumbUrl={getMarkerImageUrl}
          t={t}
        />
      )}
      {clusterHint && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: isMobileLayout ? 208 : 86,
            transform: 'translateX(-50%)',
            zIndex: 80,
            background: 'rgba(42, 28, 18, 0.92)',
            border: '1px solid rgba(212, 168, 83, 0.35)',
            color: '#f5e6c8',
            borderRadius: 999,
            padding: '8px 14px',
            fontSize: 12
          }}
        >
          {clusterHint}
        </div>
      )}
    </div>
  )
}

export default App
