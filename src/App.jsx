import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import artPlaceholder from './assets/art-placeholder.svg'
import renaissanceGlobeTexture from './assets/renaissance-globe-texture.svg'
import { artworks, easternArtData } from './artData'
import externalArtData from './data/externalArtData.json'
import FilterPanel from './components/FilterPanel'
import ArtworkSidePanel from './components/ArtworkSidePanel'
import { normalizeArtworks } from './services/normalizeArtwork'
import { resolveHtmlMarkerData, resolveLodData } from './services/artLod'

const FAR_TO_MID = 2.15
const MID_TO_FAR = 2.3
const MID_TO_NEAR = 1.2
const NEAR_TO_MID = 1.32
const MARKER_STYLE_TAG_ID = 'art-globe-marker-animations'

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
  const [activeMarker, setActiveMarker] = useState(null)
  const [selectedPeriods, setSelectedPeriods] = useState(new Set())
  const [clusterHint, setClusterHint] = useState('')
  const [cameraAltitude, setCameraAltitude] = useState(2.4)
  const [zoomBand, setZoomBand] = useState('far')
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
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
    animationFrame: null,
    flyInTimer: null,
    initialized: false
  })
  const brokenImageUrlsRef = useRef(new Set())
  const markerTelemetryRef = useRef({
    tierThumb: 0,
    tierPlaceholder: 0,
    thumbErrors: 0
  })
  const allArtworks = useMemo(
    () => normalizeArtworks([...(artworks || []), ...(easternArtData || []), ...(externalArtData || [])]),
    []
  )

  const filteredArtworks = useMemo(() => {
    if (selectedPeriods.size === 0) return allArtworks
    return allArtworks.filter((art) => selectedPeriods.has(art.time_period))
  }, [allArtworks, selectedPeriods])
  const jitteredArtworks = useMemo(() => spreadOutArtworks(filteredArtworks), [filteredArtworks])
  const visibleArtworks = useMemo(
    () => resolveLodData(jitteredArtworks, cameraAltitude, 80),
    [jitteredArtworks, cameraAltitude]
  )
  const htmlMarkerData = useMemo(
    () => resolveHtmlMarkerData(visibleArtworks, activeMarker, zoomBand),
    [visibleArtworks, activeMarker, zoomBand]
  )

  const selectedItemForPanel = useMemo(() => {
    if (!activeMarker || activeMarker.isCluster) return null
    if (activeMarker.isMuseumStack) {
      return {
        ...activeMarker,
        artworks: activeMarker.artworks
          ?.map((item) => allArtworks.find((art) => String(art.id) === String(item.id)) ?? item)
          .filter(Boolean)
      }
    }
    return allArtworks.find((art) => String(art.id) === String(activeMarker.id)) ?? activeMarker
  }, [activeMarker, allArtworks])

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
      .art-marker-pin {
        transform-origin: center;
      }
      .art-marker-pin--artwork {
        animation: artMarkerPulseArtwork 2.7s ease-in-out infinite;
      }
      .art-marker-pin--cluster {
        animation: artMarkerPulseCluster 2.4s ease-in-out infinite;
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
    for (let i = 0; i < 160; i += 1) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      const radius = 20 + Math.random() * 75
      const gradient = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius)
      gradient.addColorStop(0, 'rgba(255, 230, 170, 0.22)')
      gradient.addColorStop(0.45, 'rgba(255, 230, 170, 0.12)')
      gradient.addColorStop(1, 'rgba(255, 230, 170, 0)')
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
    if (visualFxRef.current.flyInTimer) window.clearTimeout(visualFxRef.current.flyInTimer)
    visualFxRef.current.flyInTimer = window.setTimeout(() => {
      globe?.pointOfView({ lat: 24, lng: 90, altitude: 2.4 }, 2500)
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
      opacity: 0.33,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial)
    cloudMesh.renderOrder = 2
    scene.add(cloudMesh)

    const starCount = 2200
    const positions = new Float32Array(starCount * 3)
    const starRadius = globeRadius * 10
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
      color: '#f0e6d0',
      size: globeRadius * 0.012,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
    const starField = new THREE.Points(starGeometry, starMaterial)
    scene.add(starField)

    const animate = () => {
      cloudMesh.rotation.y += 0.00014
      starField.rotation.y += 0.00003
      visualFxRef.current.animationFrame = window.requestAnimationFrame(animate)
    }
    visualFxRef.current.cloudMesh = cloudMesh
    visualFxRef.current.cloudGeometry = cloudGeometry
    visualFxRef.current.cloudMaterial = cloudMaterial
    visualFxRef.current.starField = starField
    visualFxRef.current.starGeometry = starGeometry
    visualFxRef.current.starMaterial = starMaterial
    visualFxRef.current.animationFrame = window.requestAnimationFrame(animate)
  }, [buildCloudTexture, scheduleAutoRotateResume])

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
      visualFx.cloudGeometry?.dispose()
      visualFx.cloudMaterial?.dispose()
      visualFx.starGeometry?.dispose()
      visualFx.starMaterial?.dispose()
      visualFxRef.current = {
        cloudMesh: null,
        cloudGeometry: null,
        cloudMaterial: null,
        starField: null,
        starGeometry: null,
        starMaterial: null,
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

  const handlePointClick = useCallback(
    (point) => {
      if (!point) return
      pauseAutoRotate()
      scheduleAutoRotateResume()
      if (point.isCluster) {
        const clusterItems = Array.isArray(point.clusterItems) ? point.clusterItems : []
        if (clusterItems.length > 0 && clusterItems.length <= 3) {
          setClusterHint('')
          setActiveMarker(clusterItems[0])
          focusOnArtwork(clusterItems[0], Math.max(0.9, cameraAltitude * 0.82))
          return
        }
        setClusterHint('Zoom in to open artwork details.')
        if (clusterHintTimerRef.current) window.clearTimeout(clusterHintTimerRef.current)
        clusterHintTimerRef.current = window.setTimeout(() => setClusterHint(''), 1400)
        focusOnArtwork(point, Math.max(0.95, cameraAltitude * 0.62))
        return
      }
      setClusterHint('')
      setActiveMarker(point)
    },
    [cameraAltitude, focusOnArtwork, pauseAutoRotate, scheduleAutoRotateResume]
  )

  const handleZoom = useCallback(({ altitude }) => {
    pendingAltitudeRef.current = altitude
    setZoomBand((previous) => {
      if (previous === 'far') {
        return altitude <= FAR_TO_MID ? 'mid' : 'far'
      }
      if (previous === 'mid') {
        if (altitude > MID_TO_FAR) return 'far'
        if (altitude <= MID_TO_NEAR) return 'near'
        return 'mid'
      }
      return altitude > NEAR_TO_MID ? 'mid' : 'near'
    })
    if (zoomRafRef.current) return
    zoomRafRef.current = window.requestAnimationFrame(() => {
      setCameraAltitude(pendingAltitudeRef.current)
      zoomRafRef.current = null
    })
  }, [])

  const createArtworkElement = useCallback(
    (art) => {
      const rawImageUrl = typeof art?.imageUrl === 'string' ? art.imageUrl.trim() : ''
      const size = zoomBand === 'far' ? 26 : zoomBand === 'mid' ? 34 : 40
      const wrapper = document.createElement('div')
      wrapper.dataset.artId = String(art.id ?? '')
      wrapper.dataset.isCluster = art.isCluster ? 'true' : 'false'
      wrapper.style.width = `${size + 150}px`
      wrapper.style.height = `${size + 74}px`
      wrapper.style.overflow = 'visible'
      wrapper.style.position = 'relative'
      wrapper.style.display = 'flex'
      wrapper.style.alignItems = 'flex-start'
      wrapper.style.justifyContent = 'flex-start'
      wrapper.style.pointerEvents = 'none'
      wrapper.style.transform = 'translate(-10px, -8px)'

      const pin = document.createElement('button')
      pin.type = 'button'
      pin.setAttribute(
        'aria-label',
        art.isCluster
          ? `${art.clusterCount ?? 0} artworks cluster`
          : `${art.title} by ${art.artist}`
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
      pin.style.top = '8px'
      pin.style.left = '10px'
      pin.style.zIndex = '5'
      pin.className = art.isCluster ? 'art-marker-pin art-marker-pin--cluster' : 'art-marker-pin art-marker-pin--artwork'

      const image = document.createElement('img')
      image.crossOrigin = 'anonymous'
      const canonicalImageUrl = typeof art?.canonicalImageUrl === 'string' ? art.canonicalImageUrl.trim() : ''
      const resolvedSource = canonicalImageUrl || rawImageUrl
      const thumbSrc = getMarkerImageUrl(resolvedSource)

      const setImageTier = (tier, nextSrc) => {
        image.dataset.fallbackTier = tier
        image.src = nextSrc
        if (tier === 'thumb') trackMarkerTelemetry('tierThumb')
        else if (tier === 'placeholder') trackMarkerTelemetry('tierPlaceholder')
      }

      setImageTier('thumb', thumbSrc || artPlaceholder)
      image.alt = `${art.title} by ${art.artist}`
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.objectFit = 'cover'

      image.onerror = () => {
        trackMarkerTelemetry('thumbErrors')
        if (rawImageUrl) brokenImageUrlsRef.current.add(rawImageUrl)
        image.onerror = null
        setImageTier('placeholder', artPlaceholder)
      }
      pin.appendChild(image)
      wrapper.appendChild(pin)

      const miniCard = document.createElement('button')
      miniCard.type = 'button'
      miniCard.style.position = 'absolute'
      miniCard.style.left = `${size + 16}px`
      miniCard.style.top = '4px'
      miniCard.style.width = '132px'
      miniCard.style.maxWidth = '132px'
      miniCard.style.background = 'rgba(42, 28, 18, 0.92)'
      miniCard.style.border = '1px solid rgba(212, 168, 83, 0.4)'
      miniCard.style.borderRadius = '8px'
      miniCard.style.padding = '6px 7px'
      miniCard.style.color = '#f5e6c8'
      miniCard.style.textAlign = 'left'
      miniCard.style.pointerEvents = 'auto'
      miniCard.style.cursor = 'pointer'
      miniCard.style.zIndex = '4'
      miniCard.style.boxShadow = '0 4px 10px rgba(0,0,0,0.28)'
      miniCard.innerHTML = `<span style="display:block;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${art.title}</span>
<span style="display:block;font-size:10px;color:#c4a882;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${art.artist}</span>
<span style="display:block;font-size:10px;color:#d4a853;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${art.museumName ?? ''}</span>`
      miniCard.setAttribute(
        'aria-label',
        art.isCluster
          ? `Open cluster of ${art.clusterCount ?? 0} artworks`
          : `Open details for ${art.title}`
      )
      wrapper.appendChild(miniCard)

      if (art.isCluster) {
        const badge = document.createElement('span')
        badge.textContent = String(art.clusterCount ?? 0)
        badge.style.position = 'absolute'
        badge.style.right = '-4px'
        badge.style.bottom = '-4px'
        badge.style.minWidth = '16px'
        badge.style.height = '16px'
        badge.style.padding = '0 4px'
        badge.style.borderRadius = '999px'
        badge.style.background = '#3d2a1a'
        badge.style.color = '#f5e6c8'
        badge.style.fontSize = '10px'
        badge.style.fontWeight = '700'
        badge.style.display = 'flex'
        badge.style.alignItems = 'center'
        badge.style.justifyContent = 'center'
        badge.style.border = '1px solid rgba(212, 168, 83, 0.7)'
        badge.style.zIndex = '6'
        wrapper.appendChild(badge)
      }

      const onHoverIn = () => {
        pin.style.transform = 'scale(1.12)'
        pin.style.borderColor = '#d4a853'
        pin.style.boxShadow = '0 0 14px 4px rgba(212, 168, 83, 0.45)'
      }
      const onHoverOut = () => {
        pin.style.transform = 'scale(1)'
        pin.style.borderColor = 'rgba(212, 168, 83, 0.85)'
        pin.style.boxShadow = ''
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
    [getMarkerImageUrl, handlePointClick, trackMarkerTelemetry, zoomBand]
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at 20% 20%, #4a3728 0%, #2a1c12 68%, #1a120b 100%)',
        overflow: 'hidden',
        fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif"
      }}
    >
      <FilterPanel
        selectedPeriods={selectedPeriods}
        onTogglePeriod={(period) => setSelectedPeriods(new Set([period]))}
        onClear={() => setSelectedPeriods(new Set())}
        totalCount={allArtworks.length}
        visibleCount={filteredArtworks.length}
      />
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
          backgroundColor="#2a1c12"
          showAtmosphere={true}
          atmosphereColor="rgba(195, 155, 80, 0.65)"
          atmosphereAltitude={0.18}
          globeImageUrl={renaissanceGlobeTexture}
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
      {selectedItemForPanel && (
        <ArtworkSidePanel item={selectedItemForPanel} onClose={() => setActiveMarker(null)} />
      )}
      {clusterHint && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 86,
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
