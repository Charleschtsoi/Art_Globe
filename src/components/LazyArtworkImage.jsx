import { useEffect, useState } from 'react'
import artPlaceholder from '../assets/art-placeholder.svg'
import { preloadImageUrl } from '../lib/imageRequestQueue.js'
import { resolveArtworkImageUrl, shouldUseCrossOrigin } from '../lib/imageResolver.js'

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
  const [src, setSrc] = useState(artPlaceholder)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !artwork) {
      setSrc(artPlaceholder)
      setLoading(false)
      onLoadStateChange?.('idle')
      return undefined
    }

    const remoteUrl = resolveArtworkImageUrl(artwork, { size })
    if (!remoteUrl || remoteUrl.startsWith('/artworks/')) {
      setSrc(artPlaceholder)
      setLoading(false)
      onLoadStateChange?.('unavailable')
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setSrc(artPlaceholder)
    onLoadStateChange?.('loading')

    preloadImageUrl(remoteUrl).then((ok) => {
      if (cancelled) return
      setLoading(false)
      if (ok) {
        setSrc(remoteUrl)
        onLoadStateChange?.('loaded')
      } else {
        setSrc(artPlaceholder)
        onLoadStateChange?.('error')
      }
    })

    return () => {
      cancelled = true
    }
  }, [artwork, enabled, onLoadStateChange, size])

  const crossOrigin = shouldUseCrossOrigin(src) ? 'anonymous' : undefined

  return (
    <img
      data-testid="lazy-artwork-image"
      src={src}
      alt={alt}
      crossOrigin={crossOrigin}
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
        onLoadStateChange?.('error')
      }}
    />
  )
}
