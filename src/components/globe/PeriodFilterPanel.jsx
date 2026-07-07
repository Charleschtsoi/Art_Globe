export function PeriodFilterPanel({
  t,
  datasetStats,
  selectedPeriods,
  setSelectedPeriods,
  isMobileLayout,
  zIndex,
  bottomOffset = 12
}) {
  return (
    <div
      role="complementary"
      aria-label={t('timeline.filtersAria')}
      style={{
        position: 'fixed',
        left: 'max(12px, env(safe-area-inset-left, 0px))',
        bottom: `max(${bottomOffset}px, env(safe-area-inset-bottom, 0px))`,
        zIndex,
        width: isMobileLayout ? 'min(220px, calc(100vw - 24px))' : 250,
        background: 'rgba(32, 22, 14, 0.88)',
        border: '1px solid rgba(212, 168, 83, 0.3)',
        borderRadius: 10,
        color: '#f5e6c8',
        padding: '8px 9px',
        boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
        pointerEvents: 'auto'
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{t('stats.periodFilterTitle')}</div>
      <div style={{ fontSize: 10, color: '#d9c4a1', marginBottom: 6 }}>
        {t('stats.visible')}: {datasetStats.visible.toLocaleString()} / {datasetStats.total.toLocaleString()}
      </div>
      {selectedPeriods.length > 0 && (
        <div style={{ fontSize: 9, color: '#b79d78', marginTop: -3, marginBottom: 6 }}>
          {t('stats.filtersActive')}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: '#e7d9c4' }}>
          {t('stats.byPeriod')} ({selectedPeriods.length})
        </div>
        <button
          type="button"
          onClick={() => setSelectedPeriods([])}
          disabled={selectedPeriods.length === 0}
          style={{
            border: '1px solid rgba(212, 168, 83, 0.35)',
            background: 'rgba(42, 28, 18, 0.72)',
            color: '#f5e6c8',
            opacity: selectedPeriods.length === 0 ? 0.45 : 1,
            borderRadius: 7,
            padding: '2px 6px',
            fontSize: 10,
            cursor: selectedPeriods.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {t('stats.clear')}
        </button>
      </div>
      <div
        style={{
          maxHeight: isMobileLayout ? 98 : 116,
          overflowY: 'auto',
          border: '1px solid rgba(212, 168, 83, 0.18)',
          borderRadius: 8,
          background: 'rgba(18, 12, 8, 0.52)',
          padding: 3
        }}
      >
        {datasetStats.periods.map(([name, count]) => (
          <button
            key={`period-${name}`}
            type="button"
            onClick={() =>
              setSelectedPeriods((prev) =>
                prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
              )
            }
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              fontSize: 10,
              color: '#c8aa80',
              background: selectedPeriods.includes(name) ? 'rgba(212, 168, 83, 0.2)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '5px'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  border: '1px solid rgba(212, 168, 83, 0.55)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: '#f5e6c8',
                  background: selectedPeriods.includes(name) ? 'rgba(212, 168, 83, 0.28)' : 'transparent'
                }}
              >
                {selectedPeriods.includes(name) ? '✓' : ''}
              </span>
              <span style={{ textTransform: 'capitalize' }}>
                {t(`period.${name}`) === `period.${name}` ? name.replaceAll('_', ' ') : t(`period.${name}`)}
              </span>
            </span>
            <span>{count.toLocaleString()}</span>
          </button>
        ))}
      </div>
      {selectedPeriods.length > 0 && datasetStats.visible === 0 && (
        <div style={{ fontSize: 10, color: '#b79d78', marginTop: 6 }}>{t('stats.empty')}</div>
      )}
    </div>
  )
}
