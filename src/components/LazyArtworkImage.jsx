import { useEffect, useMemo, useRef, useState } from 'react'
import artPlaceholder from '../assets/art-placeholder.svg'
import { getCachedImageResult, preloadImageUrl } from '../lib/imageRequestQueue.js'
import { resolveArtworkImageUrl } from '../lib/imageResolver.js'

/**
 * Loads a remote artwork image only when enabled (e.g. after user selects an artwork).
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

  const [src, setSrc] = useState(artPlaceholder)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const notify = (state) => onLoadStateChangeRef.current?.(state)

    if (!enabled || !artworkId || !remoteUrl || remoteUrl.startsWith('/artworks/')) {
      setSrc(artPlaceholder)
      setLoading(false)
      notify(enabled && remoteUrl.startsWith('/artworks/') ? 'unavailable' : 'idle')
      return undefined
    }

    const cached = getCachedImageResult(remoteUrl)
    if (cached === 'ok') {
      setSrc(remoteUrl)
      setLoading(false)
      notify('loaded')
      return undefined
    }
    if (cached === 'error') {
      setSrc(artPlaceholder)
      setLoading(false)
      notify('error')
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setSrc(artPlaceholder)
    notify('loading')

    preloadImageUrl(remoteUrl).then((ok) => {
      if (cancelled) return
      setLoading(false)
      if (ok) {
        setSrc(remoteUrl)
        notify('loaded')
      } else {
        setSrc(artPlaceholder)
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
      data-loading={loading ? 'true' : 'false'}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        opacity: loading ? 0.55 : 1,
        transition: 'opacity 0.18s ease',
        ...style
      }}
      onError={(e) => {
        e.currentTarget.src = artPlaceholder
        onLoadStateChangeRef.current?.('error')
      }}
    />
  )
}
