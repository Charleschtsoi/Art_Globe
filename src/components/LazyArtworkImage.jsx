import { useEffect, useMemo, useRef, useState } from 'react'
import artLoading from '../assets/art-loading.svg'
import artUnavailable from '../assets/art-unavailable.svg'
import { getCachedImageResult, preloadImageUrl } from '../lib/imageRequestQueue.js'
import { resolveArtworkImageUrl } from '../lib/imageResolver.js'

/**
 * Loads a remote artwork image only when enabled (e.g. after user selects an artwork).
 * @typedef {'idle' | 'loading' | 'loaded' | 'error' | 'unavailable'} ImageLoadStatus
 */
export default function LazyArtworkImage({
  artwork,
  size = 'detail',
  enabled = false,
  alt = '',
  style = {},
  objectFit = 'contain',
  onLoadStateChange
}) {
  const onLoadStateChangeRef = useRef(onLoadStateChange)
  onLoadStateChangeRef.current = onLoadStateChange

  const artworkId = artwork ? String(artwork.id ?? artwork.artwork_id ?? '') : ''
  const remoteUrl = useMemo(() => {
    if (!enabled || !artwork) return ''
    return resolveArtworkImageUrl(artwork, { size })
  }, [
    artworkId,
    enabled,
    size,
    artwork?.imageUrl,
    artwork?.canonicalImageUrl,
    artwork?.assets?.thumbnail_url,
    artwork?.assets?.high_res_url
  ])

  const [src, setSrc] = useState(artLoading)
  const [status, setStatus] = useState(/** @type {ImageLoadStatus} */ ('idle'))

  useEffect(() => {
    const notify = (state) => {
      setStatus(state)
      onLoadStateChangeRef.current?.(state)
    }

    if (!enabled || !artworkId || !remoteUrl || remoteUrl.startsWith('/artworks/')) {
      setSrc(artLoading)
      notify(enabled && remoteUrl.startsWith('/artworks/') ? 'unavailable' : 'idle')
      return undefined
    }

    const cached = getCachedImageResult(remoteUrl)
    if (cached === 'ok') {
      setSrc(remoteUrl)
      notify('loaded')
      return undefined
    }
    if (cached === 'error') {
      setSrc(artUnavailable)
      notify('error')
      return undefined
    }

    let cancelled = false
    setSrc(artLoading)
    notify('loading')

    preloadImageUrl(remoteUrl).then((ok) => {
      if (cancelled) return
      if (ok) {
        setSrc(remoteUrl)
        notify('loaded')
      } else {
        setSrc(artUnavailable)
        notify('error')
      }
    })

    return () => {
      cancelled = true
    }
  }, [artworkId, remoteUrl, enabled])

  return (
    <img
      data-testid="lazy-artwork-image"
      src={src}
      alt={alt}
      data-loading={status === 'loading' ? 'true' : 'false'}
      data-status={status}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        opacity: status === 'loading' ? 0.55 : 1,
        transition: 'opacity 0.18s ease',
        ...style
      }}
      onError={(e) => {
        e.currentTarget.src = artUnavailable
        setStatus('error')
        onLoadStateChangeRef.current?.('error')
      }}
    />
  )
}
