import { useEffect, useMemo, useRef, useState } from 'react'

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  background: 'rgba(2, 6, 23, 0.78)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20
}

const shellStyle = {
  width: 'min(1200px, 96vw)',
  height: 'min(780px, 92vh)',
  background: 'rgba(10, 15, 25, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 16,
  overflow: 'hidden',
  display: 'grid',
  gridTemplateColumns: '1.1fr 0.9fr'
}

export default function ArtworkModal({ artwork, onClose }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, fromX: 0, fromY: 0 })
  const dialogRef = useRef(null)
  const titleId = useMemo(
    () => `artwork-modal-title-${String(artwork?.artwork_id ?? artwork?.id ?? 'x')}`,
    [artwork]
  )
  const descriptionId = useMemo(
    () => `artwork-modal-description-${String(artwork?.artwork_id ?? artwork?.id ?? 'x')}`,
    [artwork]
  )

  useEffect(() => {
    if (!artwork) return undefined
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const selectors = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[tabindex]:not([tabindex="-1"])'
    ]
    const getFocusable = () =>
      Array.from(dialog.querySelectorAll(selectors.join(','))).filter((el) => !el.hasAttribute('disabled'))
    const focusables = getFocusable()
    focusables[0]?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Tab') {
        const nodes = getFocusable()
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => dialog.removeEventListener('keydown', onKeyDown)
  }, [artwork, onClose])

  if (!artwork) return null

  const zoomIn = () => setScale((s) => Math.min(4, s + 0.2))
  const zoomOut = () => setScale((s) => Math.max(1, s - 0.2))
  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={shellStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: 'relative', overflow: 'hidden', background: '#020617' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, display: 'flex', gap: 8 }}>
            <button type="button" onClick={zoomOut} aria-label="Zoom out image">-</button>
            <button type="button" onClick={zoomIn} aria-label="Zoom in image">+</button>
            <button type="button" onClick={resetView} aria-label="Reset image zoom and position">Reset</button>
          </div>
          <img
            src={artwork.assets?.high_res_url || artwork.imageUrl}
            alt={artwork.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              cursor: scale > 1 ? 'grab' : 'default',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.12s ease'
            }}
            onWheel={(e) => {
              e.preventDefault()
              if (e.deltaY < 0) zoomIn()
              else zoomOut()
            }}
            onMouseDown={(e) => {
              if (scale <= 1) return
              dragRef.current.active = true
              setIsDragging(true)
              dragRef.current.startX = e.clientX
              dragRef.current.startY = e.clientY
              dragRef.current.fromX = offset.x
              dragRef.current.fromY = offset.y
            }}
            onMouseMove={(e) => {
              if (!dragRef.current.active) return
              const nextX = dragRef.current.fromX + (e.clientX - dragRef.current.startX)
              const nextY = dragRef.current.fromY + (e.clientY - dragRef.current.startY)
              setOffset({ x: nextX, y: nextY })
            }}
            onMouseUp={() => {
              dragRef.current.active = false
              setIsDragging(false)
            }}
            onMouseLeave={() => {
              dragRef.current.active = false
              setIsDragging(false)
            }}
          />
        </div>

        <div
          style={{
            overflow: 'auto',
            padding: 22,
            color: '#e2e8f0',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.94), rgba(10,15,25,0.98))'
          }}
        >
          <button type="button" onClick={onClose} style={{ float: 'right' }} aria-label="Close artwork details modal">
            Close
          </button>
          <h2 id={titleId} style={{ marginTop: 0 }}>{artwork.title}</h2>
          <p><strong>Artist:</strong> {artwork.artist}</p>
          <p><strong>Year:</strong> {artwork.creation_year || artwork.year || 'Unknown'}</p>
          <p><strong>Medium:</strong> {artwork.medium || 'Unknown medium'}</p>
          <p>
            <strong>Current Location:</strong>{' '}
            {artwork.current_location?.museum || artwork.museumName}
            {artwork.current_location?.city ? `, ${artwork.current_location.city}` : ''}
            {artwork.current_location?.country ? `, ${artwork.current_location.country}` : ''}
          </p>
          <p id={descriptionId} style={{ lineHeight: 1.6, color: '#cbd5e1' }}>
            {artwork.historical_text || artwork.description}
          </p>
        </div>
      </section>
    </div>
  )
}
