export function DataLoadingBanner({ t, phase, loaded, total, error }) {
  if (error) {
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10050,
          background: 'rgba(42, 28, 18, 0.95)',
          border: '1px solid rgba(212, 100, 83, 0.5)',
          borderRadius: 12,
          padding: '16px 24px',
          color: '#f5e6c8',
          textAlign: 'center',
          maxWidth: 320
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>{t('loading.errorTitle')}</p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#c4a882' }}>{t('loading.errorBody')}</p>
      </div>
    )
  }

  if (!phase) return null

  const title = phase === 'thumbs' ? t('loading.thumbsTitle') : t('loading.title')
  const progressKey = phase === 'thumbs' ? 'loading.thumbsProgress' : 'loading.progress'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={phase === 'thumbs' ? 'loading-banner-thumbs' : 'loading-banner-data'}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10050,
        background: 'rgba(32, 22, 14, 0.92)',
        border: '1px solid rgba(212, 168, 83, 0.4)',
        borderRadius: 12,
        padding: '20px 28px',
        color: '#f5e6c8',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)'
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</p>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: '#d4a882' }}>
        {t(progressKey, { loaded: loaded.toLocaleString(), total: total.toLocaleString() })}
      </p>
      {total > 0 && (
        <div
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 2,
            background: 'rgba(212, 168, 83, 0.2)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (loaded / total) * 100)}%`,
              background: '#d4a853',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      )}
    </div>
  )
}
