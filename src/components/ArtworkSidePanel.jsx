import { useEffect, useMemo, useRef, useState } from 'react'

const panelStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 'min(420px, 92vw)',
  height: '100vh',
  zIndex: 70,
  background: 'rgba(32, 22, 14, 0.97)',
  borderLeft: '1px solid rgba(212, 168, 83, 0.25)',
  boxShadow: '0 0 40px rgba(20, 10, 5, 0.55)',
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr'
}

export default function ArtworkSidePanel({ item, onClose }) {
  const panelRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const isMuseumStack = Boolean(item?.isMuseumStack && Array.isArray(item?.artworks))
  const filteredMuseumArtworks = useMemo(() => {
    if (!isMuseumStack) return []
    const q = query.trim().toLowerCase()
    if (!q) return item.artworks
    return item.artworks.filter((art) => {
      const title = String(art?.title ?? '').toLowerCase()
      const artist = String(art?.artist ?? '').toLowerCase()
      return title.includes(q) || artist.includes(q)
    })
  }, [isMuseumStack, item, query])
  const selectedArtwork = useMemo(() => {
    if (!isMuseumStack) return item
    const first = filteredMuseumArtworks[0] ?? item.artworks[0] ?? null
    if (!selectedId) return first
    return filteredMuseumArtworks.find((art) => String(art.id) === String(selectedId)) ?? first
  }, [filteredMuseumArtworks, isMuseumStack, item, selectedId])
  const titleId = useMemo(
    () => `side-panel-title-${String(item?.artwork_id ?? item?.id ?? 'x')}`,
    [item]
  )
  const descId = useMemo(
    () => `side-panel-desc-${String(item?.artwork_id ?? item?.id ?? 'x')}`,
    [item]
  )
  const itemKey = String(item?.artwork_id ?? item?.id ?? 'x')

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

  if (!item || !selectedArtwork) return null

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 18, color: '#f5e6c8' }}>
          {isMuseumStack ? `${item.museumName} Collection` : 'Artwork Details'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close artwork side panel"
          style={{
            border: '1px solid rgba(212, 168, 83, 0.35)',
            background: 'rgba(42, 28, 18, 0.9)',
            color: '#f5e6c8',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>

      {isMuseumStack && (
        <div style={{ padding: '0 16px 8px 16px' }}>
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
            {item.stackCount} artworks at this museum
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search artworks by title or artist"
            aria-label="Search artworks in this museum"
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
            aria-label="Artworks in this museum"
            style={{ display: 'grid', gap: 6, maxHeight: 132, overflow: 'auto', paddingRight: 2 }}
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
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{art.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#c4a882' }}>{art.artist}</span>
                </button>
              )
            })}
            {filteredMuseumArtworks.length === 0 && (
              <div style={{ fontSize: 12, color: '#a08060', padding: '6px 2px' }}>
                No artworks match your search.
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px 10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(1, s - 0.2))}
            aria-label="Zoom out image"
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
            aria-label="Zoom in image"
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
            aria-label="Reset image zoom"
            style={{
              border: '1px solid rgba(212, 168, 83, 0.35)',
              background: 'rgba(42, 28, 18, 0.7)',
              color: '#f5e6c8',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            Reset
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
            alt={selectedArtwork.title}
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

      <div style={{ padding: '0 16px 20px 16px', overflow: 'auto', color: '#c4a882' }}>
        <h3 style={{ marginTop: 0, marginBottom: 8, color: '#f5e6c8' }}>{selectedArtwork.title}</h3>
        <p style={{ margin: '0 0 6px 0' }}><strong>Artist:</strong> {selectedArtwork.artist}</p>
        <p style={{ margin: '0 0 6px 0' }}><strong>Year:</strong> {selectedArtwork.creation_year || selectedArtwork.year || 'Unknown'}</p>
        <p style={{ margin: '0 0 6px 0' }}><strong>Medium:</strong> {selectedArtwork.medium || 'Unknown medium'}</p>
        <p style={{ margin: '0 0 10px 0' }}>
          <strong>Current Location:</strong>{' '}
          {selectedArtwork.current_location?.museum || selectedArtwork.museumName}
          {selectedArtwork.current_location?.city ? `, ${selectedArtwork.current_location.city}` : ''}
          {selectedArtwork.current_location?.country ? `, ${selectedArtwork.current_location.country}` : ''}
        </p>
        <p id={descId} style={{ lineHeight: 1.65 }}>
          {selectedArtwork.historical_text || selectedArtwork.description}
        </p>
      </div>
    </aside>
  )
}
