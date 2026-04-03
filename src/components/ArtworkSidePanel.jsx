import { useEffect, useMemo, useRef, useState } from 'react'
import artPlaceholder from '../assets/art-placeholder.svg'

const panelStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 'min(420px, 92vw)',
  height: '100dvh',
  zIndex: 150,
  background: 'rgba(32, 22, 14, 0.97)',
  borderLeft: '1px solid rgba(212, 168, 83, 0.25)',
  boxShadow: '0 0 40px rgba(20, 10, 5, 0.55)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  overflow: 'hidden',
  minHeight: 0,
  isolation: 'isolate'
}

const headerBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  flexShrink: 0,
  position: 'relative',
  zIndex: 1
}

export default function ArtworkSidePanel({ item, onClose, onSelectArtwork, getThumbUrl, t }) {
  const panelRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [clusterQuery, setClusterQuery] = useState('')
  const resolveThumb = useMemo(() => {
    if (typeof getThumbUrl === 'function') return getThumbUrl
    return (url) => (url ? url : artPlaceholder)
  }, [getThumbUrl])
  const isClusterPicker = Boolean(item?.isClusterPicker && Array.isArray(item?.clusterArtworks))
  const isMuseumStack = Boolean(item?.isMuseumStack && Array.isArray(item?.artworks))
  const filteredMuseumArtworks = useMemo(() => {
    if (!isMuseumStack) return []
    const q = query.trim().toLowerCase()
    if (!q) return item.artworks
    return item.artworks.filter((art) => {
      const title = String(art?.displayTitle ?? art?.title ?? '').toLowerCase()
      const artist = String(art?.displayArtist ?? art?.artist ?? '').toLowerCase()
      return title.includes(q) || artist.includes(q)
    })
  }, [isMuseumStack, item, query])
  const filteredClusterArtworks = useMemo(() => {
    if (!isClusterPicker) return []
    const q = clusterQuery.trim().toLowerCase()
    const list = item.clusterArtworks
    if (!q) return list
    return list.filter((art) => {
      const title = String(art?.displayTitle ?? art?.title ?? '').toLowerCase()
      const artist = String(art?.displayArtist ?? art?.artist ?? '').toLowerCase()
      const museum = String(
        art?.displayMuseumName ?? art?.museumName ?? art?.current_location?.museum ?? ''
      ).toLowerCase()
      return title.includes(q) || artist.includes(q) || museum.includes(q)
    })
  }, [isClusterPicker, item, clusterQuery])
  const selectedArtwork = useMemo(() => {
    if (isClusterPicker) return null
    if (!isMuseumStack) return item
    const first = filteredMuseumArtworks[0] ?? item.artworks[0] ?? null
    if (!selectedId) return first
    return filteredMuseumArtworks.find((art) => String(art.id) === String(selectedId)) ?? first
  }, [filteredMuseumArtworks, isClusterPicker, isMuseumStack, item, selectedId])
  const itemKey = String(
    item?.isClusterPicker ? `cluster-${item.clusterId ?? item.clusterCount}` : item?.artwork_id ?? item?.id ?? 'x'
  )
  const titleId = useMemo(() => `side-panel-title-${itemKey}`, [itemKey])
  const descId = useMemo(() => `side-panel-desc-${itemKey}`, [itemKey])

  useEffect(() => {
    if (!item) return undefined
    panelRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, onClose])

  if (!item) return null

  if (isClusterPicker) {
    const count = item.clusterCount ?? filteredClusterArtworks.length
    return (
      <aside
        key={itemKey}
        ref={panelRef}
        tabIndex={-1}
        role="complementary"
        aria-labelledby={titleId}
        style={{ ...panelStyle, gridTemplateRows: 'auto 1fr', overflow: 'hidden' }}
      >
        <div style={headerBarStyle}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, color: '#f5e6c8' }}>
            {t('panel.clusterTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panel.closeAria')}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.9)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            {t('panel.close')}
          </button>
        </div>
        <div
          style={{
            padding: '0 16px 16px 16px',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateRows: 'auto auto 1fr',
            minHeight: 0,
            flex: 1
          }}
        >
          <p style={{ margin: '0 0 10px 0', color: '#d4a853', fontSize: 13 }}>
            {t('panel.clusterHint', { count })}
          </p>
          <input
            type="search"
            value={clusterQuery}
            onChange={(event) => setClusterQuery(event.target.value)}
            placeholder={t('panel.clusterSearchPlaceholder')}
            aria-label={t('panel.clusterSearchAria')}
            style={{
              width: '100%',
              marginBottom: 12,
              background: 'rgba(42, 28, 18, 0.75)',
              border: '1px solid rgba(212, 168, 83, 0.35)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '7px 9px'
            }}
          />
          <div
            role="listbox"
            aria-label={t('panel.clusterListAria')}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
              overflow: 'auto',
              paddingRight: 4,
              alignContent: 'start',
              minHeight: 0
            }}
          >
            {filteredClusterArtworks.map((art) => {
              const raw = typeof art?.canonicalImageUrl === 'string' ? art.canonicalImageUrl.trim() : ''
              const rawImg = typeof art?.imageUrl === 'string' ? art.imageUrl.trim() : ''
              const thumbSrc = resolveThumb(raw || rawImg)
              return (
                <button
                  key={String(art.id)}
                  type="button"
                  role="option"
                  onClick={() => typeof onSelectArtwork === 'function' && onSelectArtwork(art)}
                  aria-label={t('panel.openArtworkAria', {
                    title: art.displayTitle ?? art.title,
                    artist: art.displayArtist ?? art.artist
                  })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6,
                    padding: '8px',
                    borderRadius: 10,
                    border: '1px solid rgba(212, 168, 83, 0.3)',
                    background: 'rgba(42, 28, 18, 0.85)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#f5e6c8'
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#2a1c12',
                      border: '1px solid rgba(212, 168, 83, 0.2)'
                    }}
                  >
                    <img
                      src={thumbSrc || artPlaceholder}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.src = artPlaceholder
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {art.displayTitle ?? art.title}
                  </span>
                  <span style={{ fontSize: 10, color: '#c4a882', lineHeight: 1.2 }}>
                    {art.displayArtist ?? art.artist}
                  </span>
                </button>
              )
            })}
            {filteredClusterArtworks.length === 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#a08060', padding: '8px 4px' }}>
                {t('panel.noSearchResults')}
              </div>
            )}
          </div>
        </div>
      </aside>
    )
  }

  if (!selectedArtwork) {
    return (
      <aside
        key={itemKey}
        ref={panelRef}
        tabIndex={-1}
        role="complementary"
        aria-labelledby={titleId}
        style={panelStyle}
      >
        <div style={headerBarStyle}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, color: '#f5e6c8' }}>
            {t('panel.detailsTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panel.closeAria')}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.9)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            {t('panel.close')}
          </button>
        </div>
        <div style={{ padding: '12px 16px 20px', color: '#c4a882', fontSize: 13, lineHeight: 1.5, minHeight: 0 }}>
          {t('panel.unavailable')}
        </div>
      </aside>
    )
  }

  return (
    <aside
      key={itemKey}
      ref={panelRef}
      tabIndex={-1}
      role="complementary"
      aria-labelledby={titleId}
      aria-describedby={descId}
      style={panelStyle}
    >
      <div style={headerBarStyle}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 18, color: '#f5e6c8' }}>
          {isMuseumStack
            ? `${item.museumName}${t('panel.collectionSuffix')}`
            : t('panel.detailsTitle')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('panel.closeAria')}
          style={{
            border: '1px solid rgba(212, 168, 83, 0.35)',
            background: 'rgba(42, 28, 18, 0.9)',
            color: '#f5e6c8',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer'
          }}
        >
          {t('panel.close')}
        </button>
      </div>

      <div
        style={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
      {isMuseumStack && (
        <div style={{ padding: '0 16px 8px 16px', flexShrink: 0 }}>
          <div
            style={{
              marginBottom: 8,
              borderRadius: 10,
              overflow: 'hidden',
              height: 116,
                border: '1px solid rgba(212, 168, 83, 0.25)',
                background: '#2a1c12'
            }}
          >
            <img
              src={item.museumImageUrl || '/museums/default-museum.svg'}
              alt={item.museumName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <p style={{ margin: '0 0 8px 0', color: '#d4a853', fontSize: 12 }}>
            {t('panel.museumCount', { count: item.stackCount })}
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('panel.museumSearchPlaceholder')}
            aria-label={t('panel.museumSearchAria')}
            style={{
              width: '100%',
              marginBottom: 8,
              background: 'rgba(42, 28, 18, 0.75)',
              border: '1px solid rgba(212, 168, 83, 0.35)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '7px 9px'
            }}
          />
          <div
            role="listbox"
            aria-label={t('panel.museumListAria')}
            style={{
              display: 'grid',
              gap: 6,
              maxHeight: 132,
              overflow: 'auto',
              paddingRight: 2,
              minHeight: 0,
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {filteredMuseumArtworks.map((art) => {
              const isActive = String(art.id) === String(selectedArtwork.id)
              return (
                <button
                  key={art.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => setSelectedId(art.id)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: isActive ? '1px solid rgba(212, 168, 83, 0.85)' : '1px solid rgba(212, 168, 83, 0.25)',
                    background: isActive ? 'rgba(58, 36, 21, 0.85)' : 'rgba(42, 28, 18, 0.75)',
                    color: '#f5e6c8',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>
                    {art.displayTitle ?? art.title}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: '#c4a882' }}>
                    {art.displayArtist ?? art.artist}
                  </span>
                </button>
              )
            })}
            {filteredMuseumArtworks.length === 0 && (
              <div style={{ fontSize: 12, color: '#a08060', padding: '6px 2px' }}>
                {t('panel.noSearchResults')}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px 10px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(1, s - 0.2))}
            aria-label={t('panel.zoomOutAria')}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.7)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(4, s + 0.2))}
            aria-label={t('panel.zoomInAria')}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.7)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            aria-label={t('panel.resetZoomAria')}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.7)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            {t('panel.reset')}
          </button>
        </div>
        <div
          style={{
            height: 220,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid rgba(212, 168, 83, 0.25)',
            background: '#2a1c12',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <img
            src={selectedArtwork.assets?.high_res_url || selectedArtwork.imageUrl}
            alt={selectedArtwork.displayTitle ?? selectedArtwork.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: `scale(${scale})`,
              transition: 'transform 0.12s ease'
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '0 16px 20px 16px',
          color: '#c4a882'
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8, color: '#f5e6c8' }}>
          {selectedArtwork.displayTitle ?? selectedArtwork.title}
        </h3>
        <p style={{ margin: '0 0 6px 0' }}>
          <strong>{t('panel.artist')}:</strong> {selectedArtwork.displayArtist ?? selectedArtwork.artist}
        </p>
        <p style={{ margin: '0 0 6px 0' }}>
          <strong>{t('panel.year')}:</strong>{' '}
          {selectedArtwork.displayYear ?? selectedArtwork.creation_year ?? selectedArtwork.year}
        </p>
        <p style={{ margin: '0 0 6px 0' }}>
          <strong>{t('panel.medium')}:</strong>{' '}
          {selectedArtwork.displayMedium ?? selectedArtwork.medium}
        </p>
        <p style={{ margin: '0 0 10px 0' }}>
          <strong>{t('panel.location')}:</strong>{' '}
          {selectedArtwork.displayMuseumName ??
            selectedArtwork.current_location?.museum ??
            selectedArtwork.museumName}
          {selectedArtwork.displayCity || selectedArtwork.current_location?.city
            ? `, ${selectedArtwork.displayCity || selectedArtwork.current_location?.city}`
            : ''}
          {selectedArtwork.displayCountry || selectedArtwork.current_location?.country
            ? `, ${selectedArtwork.displayCountry || selectedArtwork.current_location?.country}`
            : ''}
        </p>
        <p id={descId} style={{ lineHeight: 1.65 }}>
          {selectedArtwork.displayHistorical ??
            selectedArtwork.displayDescription ??
            selectedArtwork.historical_text ??
            selectedArtwork.description}
        </p>
      </div>
      </div>
    </aside>
  )
}
