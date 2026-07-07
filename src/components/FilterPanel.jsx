import { useMemo } from 'react'
import { PERIOD_KEYS } from '../constants/periods'

const shellStyle = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 12,
  zIndex: 40,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none'
}

const panelStyle = {
  width: 'min(560px, calc(100vw - 48px))',
  background: 'rgba(42, 28, 18, 0.9)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(212, 168, 83, 0.35)',
  borderRadius: 12,
  boxShadow: '0 10px 32px rgba(0, 0, 0, 0.35)',
  color: '#f5e6c8',
  padding: '8px 14px',
  pointerEvents: 'auto'
}

export default function FilterPanel({
  selectedPeriods,
  onTogglePeriod,
  onClear,
  totalCount,
  visibleCount,
  t
}) {
  const activeIndex = useMemo(
    () => PERIOD_KEYS.findIndex((period) => selectedPeriods.has(period)),
    [selectedPeriods]
  )

  const selectedIndex = activeIndex < 0 ? 0 : activeIndex
  const selectedLabel =
    activeIndex < 0 ? t('period.all') : t(`period.${PERIOD_KEYS[activeIndex]}`)

  const setPeriodByIndex = (index) => {
    const clamped = Math.max(0, Math.min(PERIOD_KEYS.length - 1, index))
    onTogglePeriod(PERIOD_KEYS[clamped])
  }

  return (
    <div style={shellStyle}>
      <aside style={panelStyle} aria-label={t('timeline.filtersAria')}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 6
          }}
        >
          <p style={{ margin: 0, color: '#a08060', fontSize: 12 }}>
            {t('timeline.label')}: {selectedLabel} ({visibleCount} / {totalCount})
          </p>
          <button
            type="button"
            onClick={onClear}
            style={{
              border: '1px solid rgba(212, 168, 83, 0.4)',
              background: 'rgba(42, 28, 18, 0.85)',
              color: '#f5e6c8',
              borderRadius: 999,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            {t('timeline.clear')}
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gap: 6
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              margin: '0 auto'
            }}
          >
            <input
              type="range"
              min={0}
              max={PERIOD_KEYS.length - 1}
              step={1}
              value={selectedIndex}
              onChange={(event) => setPeriodByIndex(Number(event.target.value))}
              onWheel={(event) => {
                event.preventDefault()
                const delta = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1
                setPeriodByIndex(selectedIndex + delta)
              }}
              aria-label={t('timeline.sliderAria')}
              aria-valuemin={0}
              aria-valuemax={PERIOD_KEYS.length - 1}
              aria-valuenow={selectedIndex}
              aria-valuetext={selectedLabel}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#d4a853'
              }}
            />
          </div>
          <div
            aria-hidden="true"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${PERIOD_KEYS.length}, minmax(0, 1fr))`,
              gap: 4
            }}
          >
            {PERIOD_KEYS.map((periodKey, idx) => (
              <div
                key={periodKey}
                style={{
                  textAlign: 'center',
                  fontSize: 10,
                  color: idx === selectedIndex ? '#f5deb3' : '#a08060',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                title={t(`period.${periodKey}`)}
              >
                {t(`period.${periodKey}`)}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
