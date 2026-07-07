export function GlobeZoomControls({
  t,
  cameraAltitude,
  minAltitude,
  maxAltitude,
  onZoomIn,
  onZoomOut,
  zIndex,
  bottomOffset = 16
}) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 'max(14px, env(safe-area-inset-right, 0px))',
        bottom: `max(${bottomOffset}px, env(safe-area-inset-bottom, 0px))`,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
        pointerEvents: 'auto'
      }}
    >
      <button
        type="button"
        aria-label={t('controls.zoomInAria')}
        onClick={onZoomIn}
        disabled={!Number.isFinite(cameraAltitude) || cameraAltitude <= minAltitude + 0.01}
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(212, 168, 83, 0.45)',
          background: 'rgba(32, 22, 14, 0.92)',
          color: '#f5e6c8',
          fontSize: 24,
          lineHeight: '1',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          flexShrink: 0,
          opacity:
            !Number.isFinite(cameraAltitude) || cameraAltitude <= minAltitude + 0.01 ? 0.45 : 1
        }}
      >
        +
      </button>
      <button
        type="button"
        aria-label={t('controls.zoomOutAria')}
        onClick={onZoomOut}
        disabled={!Number.isFinite(cameraAltitude) || cameraAltitude >= maxAltitude - 0.01}
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          border: '1px solid rgba(212, 168, 83, 0.45)',
          background: 'rgba(32, 22, 14, 0.92)',
          color: '#f5e6c8',
          fontSize: 24,
          lineHeight: '1',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          flexShrink: 0,
          opacity:
            !Number.isFinite(cameraAltitude) || cameraAltitude >= maxAltitude - 0.01 ? 0.45 : 1
        }}
      >
        -
      </button>
    </div>
  )
}
