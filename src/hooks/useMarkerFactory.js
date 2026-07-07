import { useCallback } from 'react'
import artPlaceholder from '../assets/art-placeholder.svg'

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function useMarkerFactory({
  t,
  markerZoomBand,
  getMarkerImageUrl,
  handlePointClick,
  trackMarkerTelemetry,
  brokenImageUrlsRef,
  loadedImageUrlsRef
}) {
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
      miniCard.style.top = `${size / 2}px`
      miniCard.style.transform = 'translateY(-50%)'
      miniCard.style.width = '132px'
      miniCard.style.maxWidth = '132px'
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
    [getMarkerImageUrl, handlePointClick, markerZoomBand, trackMarkerTelemetry, t, brokenImageUrlsRef, loadedImageUrlsRef]
  )

  return { createArtworkElement }
}
