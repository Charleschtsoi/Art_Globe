import { useCallback, useEffect, useMemo, useRef } from 'react'
import LazyArtworkImage from './LazyArtworkImage.jsx'
import { formatGeoCue, getTeachingSummary } from '../lib/teachingSummary.js'

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10060,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  background: 'rgba(8, 6, 4, 0.72)',
  backdropFilter: 'blur(2px)',
  isolation: 'isolate'
}

const cardStyle = {
  margin: 'clamp(12px, 2vh, 24px)',
  marginTop: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
  gap: 'clamp(16px, 2.5vw, 32px)',
  minHeight: 0,
  background: 'rgba(32, 22, 14, 0.97)',
  border: '1px solid rgba(212, 168, 83, 0.35)',
  borderRadius: 16,
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)',
  overflow: 'hidden'
}

const btnStyle = {
  border: '1px solid rgba(212, 168, 83, 0.4)',
  background: 'rgba(42, 28, 18, 0.9)',
  color: '#f5e6c8',
  borderRadius: 8,
  padding: '8px 14px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600
}

export default function PresentModeOverlay({
  artwork,
  queue = [],
  queueIndex = 0,
  onClose,
  onNavigate,
  dataReady = true,
  isMobileLayout = false,
  t
}) {
  const dialogRef = useRef(null)
  const liveRef = useRef(null)

  const title = artwork?.displayTitle ?? artwork?.title ?? ''
  const artist = artwork?.displayArtist ?? artwork?.artist ?? ''
  const year = artwork?.displayYear ?? artwork?.creation_year ?? artwork?.year ?? ''
  const medium = artwork?.displayMedium ?? artwork?.medium ?? ''
  const museum =
    artwork?.displayMuseumName ?? artwork?.museumName ?? artwork?.current_location?.museum ?? ''
  const city = artwork?.displayCity ?? artwork?.current_location?.city ?? ''
  const country = artwork?.displayCountry ?? artwork?.current_location?.country ?? ''
  const periodKey = String(artwork?.time_period ?? artwork?.timePeriod ?? '')
  const periodLabel =
    periodKey && periodKey !== 'unknown' ? t(`period.${periodKey}`) : ''
  const geoCue = formatGeoCue(artwork?.lat, artwork?.lng)
  const summary = useMemo(() => getTeachingSummary(artwork, { t }), [artwork, t])
  const sourceUrl = String(artwork?.sourceUrl ?? '').trim()

  const canPrev = queue.length > 1 && queueIndex > 0
  const canNext = queue.length > 1 && queueIndex < queue.length - 1

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key === 'ArrowLeft' && canPrev) {
        event.preventDefault()
        onNavigate?.(queueIndex - 1)
        return
      }
      if (event.key === 'ArrowRight' && canNext) {
        event.preventDefault()
        onNavigate?.(queueIndex + 1)
      }
    },
    [canNext, canPrev, onClose, onNavigate, queueIndex]
  )

  useEffect(() => {
    dialogRef.current?.focus()
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (liveRef.current && title) {
      liveRef.current.textContent = `${title} — ${artist}`
    }
  }, [title, artist, queueIndex])

  if (!artwork) return null

  const locationLine = [city, country].filter(Boolean).join(', ')

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="present-mode-title"
      tabIndex={-1}
      style={overlayStyle}
      data-testid="present-mode-overlay"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 'clamp(12px, 2vh, 20px) clamp(16px, 3vw, 28px)',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={btnStyle} aria-label={t('present.exitAria')}>
            {t('present.exit')}
          </button>
          {periodLabel ? (
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#d4a853',
                border: '1px solid rgba(212, 168, 83, 0.35)',
                borderRadius: 999,
                padding: '4px 12px'
              }}
            >
              {periodLabel}
              {year && year !== t('unknown.year') ? ` · ${year}` : ''}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onNavigate?.(queueIndex - 1)}
            style={{ ...btnStyle, opacity: canPrev ? 1 : 0.45, cursor: canPrev ? 'pointer' : 'default' }}
            aria-label={t('present.prevAria')}
          >
            {t('present.prev')}
          </button>
          <span style={{ fontSize: 13, color: '#c4a882', minWidth: 64, textAlign: 'center' }}>
            {queue.length > 1 ? `${queueIndex + 1} / ${queue.length}` : ''}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onNavigate?.(queueIndex + 1)}
            style={{ ...btnStyle, opacity: canNext ? 1 : 0.45, cursor: canNext ? 'pointer' : 'default' }}
            aria-label={t('present.nextAria')}
          >
            {t('present.next')}
          </button>
        </div>
      </div>

      <div
        className="present-mode-card"
        style={{
          ...cardStyle,
          gridTemplateColumns: isMobileLayout ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 0.85fr)'
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a120c',
            padding: 'clamp(12px, 2vw, 24px)',
            borderRight: isMobileLayout ? 'none' : '1px solid rgba(212, 168, 83, 0.15)',
            borderBottom: isMobileLayout ? '1px solid rgba(212, 168, 83, 0.15)' : 'none'
          }}
        >
          <div
            style={{
              width: '100%',
              height: 'min(62vh, 520px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LazyArtworkImage
              artwork={artwork}
              size="detail"
              enabled={dataReady}
              alt={title}
              objectFit="contain"
              style={{ maxHeight: '100%' }}
            />
          </div>
        </div>

        <div
          style={{
            padding: 'clamp(16px, 2.5vw, 28px)',
            overflow: 'auto',
            color: '#c4a882',
            minHeight: 0
          }}
        >
          <p ref={liveRef} className="sr-only" aria-live="polite" />
          <h2
            id="present-mode-title"
            style={{
              margin: '0 0 8px',
              fontSize: 'clamp(24px, 3.2vw, 36px)',
              lineHeight: 1.2,
              color: '#f5e6c8'
            }}
          >
            {title}
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 'clamp(16px, 2vw, 22px)', color: '#d4a882' }}>
            {artist}
            {year && year !== t('unknown.year') ? ` · ${year}` : ''}
          </p>

          <div
            style={{
              marginBottom: 20,
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(42, 28, 18, 0.75)',
              border: '1px solid rgba(212, 168, 83, 0.25)'
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#d4a853', marginBottom: 6 }}>
              {t('present.locationHeading')}
            </div>
            <div style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', color: '#f5e6c8', fontWeight: 600 }}>
              {museum || t('unknown.museum')}
            </div>
            {locationLine ? (
              <div style={{ fontSize: 'clamp(14px, 1.6vw, 17px)', marginTop: 4 }}>{locationLine}</div>
            ) : null}
            {geoCue ? (
              <div style={{ fontSize: 12, marginTop: 8, color: '#a08060' }}>
                {t('present.geoCue', { coords: geoCue })}
              </div>
            ) : null}
          </div>

          {medium && medium !== t('unknown.medium') ? (
            <p style={{ margin: '0 0 16px', fontSize: 15 }}>
              <strong style={{ color: '#f5e6c8' }}>{t('panel.medium')}:</strong> {medium}
            </p>
          ) : null}

          <div style={{ fontSize: 'clamp(15px, 1.7vw, 20px)', lineHeight: 1.65, color: '#e8d4b8' }}>
            {summary}
          </div>

          {sourceUrl ? (
            <p style={{ marginTop: 20, marginBottom: 0 }}>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#d4a853', fontSize: 14 }}
              >
                {t('present.openSource')}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
