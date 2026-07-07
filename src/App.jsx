import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import ArtworkSidePanel from './components/ArtworkSidePanel'
import SearchBar from './components/SearchBar'
import { DataLoadingBanner } from './components/globe/DataLoadingBanner'
import { GlobeZoomControls } from './components/globe/GlobeZoomControls'
import { OnboardingCoach } from './components/globe/OnboardingCoach'
import { PeriodFilterPanel } from './components/globe/PeriodFilterPanel'
import { useAuth } from './context/AuthContext.jsx'
import { useGlobeData } from './hooks/useGlobeData'
import { useMarkerFactory } from './hooks/useMarkerFactory'
import { isSupabaseConfigured } from './lib/supabaseClient.js'
import { trackPageView } from './lib/analytics'
import { getZoomBand, resolveHtmlMarkerData, resolveLodData } from './services/artLod'
import { readStoredLocale, writeStoredLocale, translate } from './i18n/translations'
import { localizeArtworkDisplay } from './i18n/localizeArtworkDisplay'

const MARKER_STYLE_TAG_ID = 'art-globe-marker-animations'

/** Equirectangular blue marble (react-globe.gl / three-globe); omitting globeImageUrl renders a black sphere per library docs. */
const EARTH_BLUE_MARBLE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const MIN_CAMERA_ALTITUDE = 0.55
const MAX_CAMERA_ALTITUDE = 6.2
const ZOOM_STEP_RATIO = 0.82
const ZOOM_BUTTON_ANIMATION_MS = 620
/** Globe CSS2D labels get z-index up to ~number of markers; keep all fixed UI above that band. */
const Z_PANEL_BACKDROP = 10030
const Z_STATS_PERIOD = 10010
const Z_ZOOM_CONTROLS = 10015
const Z_LEFT_NAV = 10020
const Z_CLUSTER_HINT = 10025

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
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const {
    allArtworksBase,
    searchRecords,
    dataLoading,
    dataError,
    totalRecords,
    loadChunksById,
    loadSearchIndexLazy,
    maybePreloadRegion
  } = useGlobeData()
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
  const markerTelemetryRef = useRef({
    tierThumb: 0,
    tierPlaceholder: 0,
    thumbErrors: 0
  })

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale])

  useEffect(() => {
    trackPageView('/explore')
  }, [])

  const markerZoomBand = useMemo(() => getZoomBand(cameraAltitude), [cameraAltitude])
  const isMobileLayout = viewport.width <= 900

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
    () => resolveLodData(jitteredArtworks, cameraAltitude, 100, clusterI18n),
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
      total: totalRecords > 0 ? totalRecords : allArtworksBase.length,
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
      window.setTimeout(() => {
        const pov = globeRef.current?.pointOfView?.()
        if (pov && Number.isFinite(pov.altitude)) setCameraAltitude(pov.altitude)
      }, 2600)
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
  }, [buildCloudTexture, maybePreloadRegion, scheduleAutoRotateResume, setCameraAltitude])

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

  // Drop selection only when a single-artwork id disappears from the loaded map (e.g. chunk unload).
  // Do not clear cluster / museum-stack picks — those ids are not in artworkById and clusters were wrongly cleared here before.
  useEffect(() => {
    if (!activeMarker) return
    if (activeMarker.isCluster || activeMarker.isMuseumStack) return
    const id = String(activeMarker.id ?? '')
    if (!id) return
    if (!artworkById.has(id)) setActiveMarker(null)
  }, [activeMarker, artworkById])

  const { createArtworkElement } = useMarkerFactory({
    t,
    markerZoomBand,
    handlePointClick,
    trackMarkerTelemetry
  })

  const periodFilterBottom = isMobileLayout ? 86 : 12
  const zoomBottom = isMobileLayout ? 156 : selectedItemForPanel ? 22 : 16

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        minHeight: '100dvh',
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
          zIndex: Z_LEFT_NAV,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          width: isMobileLayout ? 'min(360px, calc(100vw - 24px))' : 'min(340px, calc(100vw - 24px))',
          pointerEvents: 'auto',
          isolation: 'isolate'
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
          <Link
            to="/"
            style={{ color: '#d4a853', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}
          >
            Art Globe
          </Link>
          <span style={{ color: 'rgba(212,168,83,0.35)' }}>|</span>
          <Link to="/about" style={{ color: '#c4a882', fontSize: 12, textDecoration: 'none' }}>
            {t('nav.about')}
          </Link>
        </div>
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
          onSearchFocus={loadSearchIndexLazy}
          t={t}
        />
        {isSupabaseConfigured() ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'flex-start',
              background: 'rgba(32, 22, 14, 0.92)',
              border: '1px solid rgba(212, 168, 83, 0.35)',
              borderRadius: 10,
              padding: '8px 10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/submit')}
                className="block w-full cursor-pointer rounded-lg border border-amber-600/50 bg-[rgba(32,22,14,0.92)] px-3 py-2.5 text-center text-sm font-medium text-amber-500 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-all hover:border-amber-500 hover:bg-amber-900/20"
              >
                {t('submit.cta')}
              </button>
              <p className="text-center text-[11px] leading-tight text-amber-600/80">{t('submit.ctaSub')}</p>
            </div>
            {isAdmin ? (
              <Link
                to="/moderate"
                style={{ color: '#f5e6c8', fontSize: 13, textDecoration: 'none', borderBottom: '1px solid #d4a853' }}
              >
                {t('moderate.link')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          width: '100%',
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          pointerEvents: 'auto'
        }}
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
          // Use point clicks (even when HTML markers are capped) to restore city clickability.
          // react-globe.gl notes that `onPointClick` only works reliably when `pointsMerge` is disabled.
          pointsMerge={false}
          htmlElementsData={htmlMarkerData}
          htmlElement={createArtworkElement}
          onPointClick={handlePointClick}
          onZoom={handleZoom}
          onGlobeReady={onGlobeReady}
        />
      </div>
      {selectedItemForPanel && activeMarker && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setActiveMarker(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_PANEL_BACKDROP,
            background: 'rgba(4, 8, 20, 0.45)',
            pointerEvents: 'auto'
          }}
        />
      )}
      <DataLoadingBanner
        t={t}
        loaded={allArtworksBase.length}
        total={totalRecords || allArtworksBase.length}
        error={dataError}
        isLoading={dataLoading || allArtworksBase.length === 0}
      />
      <OnboardingCoach t={t} />
      <GlobeZoomControls
        t={t}
        cameraAltitude={cameraAltitude}
        minAltitude={MIN_CAMERA_ALTITUDE}
        maxAltitude={MAX_CAMERA_ALTITUDE}
        onZoomIn={handleZoomInClick}
        onZoomOut={handleZoomOutClick}
        zIndex={Z_ZOOM_CONTROLS}
        bottomOffset={zoomBottom}
      />
      <PeriodFilterPanel
        t={t}
        datasetStats={datasetStats}
        selectedPeriods={selectedPeriods}
        setSelectedPeriods={setSelectedPeriods}
        isMobileLayout={isMobileLayout}
        zIndex={Z_STATS_PERIOD}
        bottomOffset={periodFilterBottom}
      />
      {selectedItemForPanel && activeMarker && (
        <ArtworkSidePanel
          key={
            activeMarker.isCluster
              ? `cluster-${activeMarker.id}`
              : String(activeMarker.id ?? activeMarker.artwork_id ?? 'panel')
          }
          item={selectedItemForPanel}
          onClose={() => setActiveMarker(null)}
          dataReady={!dataLoading && allArtworksBase.length > 0}
          onSelectArtwork={(art) => {
            setActiveMarker(art)
            focusOnArtwork(art, getZoomInAltitude(cameraAltitude))
          }}
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
            zIndex: Z_CLUSTER_HINT,
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
