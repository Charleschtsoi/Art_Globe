import { useEffect, useMemo, useRef, useState } from 'react'

const panelStyle = {
  position: 'relative',
  width: '100%',
  background: 'rgba(32, 22, 14, 0.92)',
  border: '1px solid rgba(212, 168, 83, 0.35)',
  borderRadius: 10,
  padding: '8px 10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
}

const inputStyle = {
  width: '100%',
  background: 'rgba(42, 28, 18, 0.6)',
  border: '1px solid rgba(212, 168, 83, 0.3)',
  borderRadius: 8,
  color: '#f5e6c8',
  outline: 'none',
  padding: '8px 10px',
  fontSize: 13
}

function SearchBar({ artworks = [], onSelectArtwork, getThumbUrl, t }) {
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const resolvedThumbUrl =
    typeof getThumbUrl === 'function'
      ? getThumbUrl
      : () => ''

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(handle)
  }, [query])

  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return []

    const matches = (art) => {
      const fields = [
        art?.displayTitle ?? art?.title,
        art?.displayArtist ?? art?.artist,
        art?.displayMuseumName ?? art?.museumName,
        art?.displayCity ?? art?.current_location?.city,
        art?.displayCountry ?? art?.current_location?.country
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .filter(Boolean)

      return fields.some((f) => f.includes(q))
    }

    return artworks.filter(matches).slice(0, 8)
  }, [artworks, debouncedQuery])

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        return
      }
      if (results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((idx) => Math.min(idx + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((idx) => Math.max(idx - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const picked = results[activeIndex]
        if (picked) {
          onSelectArtwork?.(picked)
          setIsOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, isOpen, onSelectArtwork, results])

  const onPick = (art) => {
    onSelectArtwork?.(art)
    setIsOpen(false)
  }
  const resultCount = results.length
  const resultsMaxHeight =
    resultCount <= 1 ? 92 : resultCount <= 4 ? 220 : 280

  return (
    <div ref={rootRef} style={panelStyle}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#d4a882',
            fontSize: 14
          }}
        >
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const next = e.target.value
            setQuery(next)
            setActiveIndex(0)
            setIsOpen(Boolean(next.trim()))
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true)
          }}
          aria-label={t('search.ariaLabel')}
          placeholder={t('search.placeholder')}
          style={inputStyle}
        />
      </label>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('search.resultsAria')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'rgba(42, 28, 18, 0.98)',
            border: '1px solid rgba(212, 168, 83, 0.25)',
            borderRadius: 10,
            maxHeight: resultsMaxHeight,
            overflow: 'auto'
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 10, color: '#c4a882', fontSize: 13 }}>
              {t('search.noResults')}
            </div>
          ) : (
            results.map((art, idx) => {
              const title = art?.displayTitle ?? art?.title ?? ''
              const artist = art?.displayArtist ?? art?.artist ?? ''
              const museum = art?.displayMuseumName ?? art?.museumName ?? ''
              const city = art?.displayCity ?? art?.current_location?.city ?? ''
              const thumbSrc = resolvedThumbUrl(
                art?.canonicalImageUrl ?? art?.imageUrl ?? ''
              )

              return (
                <button
                  key={String(art?.id ?? art?.artwork_id ?? idx)}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => onPick(art)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: '42px 1fr',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 10px',
                    border: 'none',
                    background:
                      idx === activeIndex ? 'rgba(212, 168, 83, 0.15)' : 'transparent',
                    cursor: 'pointer',
                    color: '#f5e6c8'
                  }}
                >
                  <img
                    src={thumbSrc}
                    alt=""
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 8,
                      objectFit: 'cover',
                      border: '1px solid rgba(212, 168, 83, 0.18)'
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 12, color: '#c4a882', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {artist}
                    </div>
                    <div style={{ fontSize: 12, color: '#d4a853', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[city || art?.displayCity, museum].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBar

