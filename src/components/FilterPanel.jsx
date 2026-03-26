import { useMemo } from 'react'

const PERIODS = [
  'Antiquity',
  'Middle Ages',
  'Renaissance',
  'Baroque',
  'Impressionism',
  'Modern',
  'Contemporary'
]

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
  width: 'min(1080px, calc(100vw - 24px))',
  background: 'rgba(42, 28, 18, 0.88)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(212, 168, 83, 0.3)',
  borderRadius: 14,
  color: '#f5e6c8',
  padding: '10px 12px',
  pointerEvents: 'auto'
}

export default function FilterPanel({
  selectedPeriods,
  onTogglePeriod,
  onClear,
  totalCount,
  visibleCount
}) {
  const activeIndex = useMemo(
    () => PERIODS.findIndex((period) => selectedPeriods.has(period)),
    [selectedPeriods]
  )

  const selectedIndex = activeIndex < 0 ? 0 : activeIndex
  const selectedLabel = activeIndex < 0 ? 'All Periods' : PERIODS[activeIndex]

  const setPeriodByIndex = (index) => {
    const clamped = Math.max(0, Math.min(PERIODS.length - 1, index))
    onTogglePeriod(PERIODS[clamped])
  }

  return (
    <div style={shellStyle}>
      <aside style={panelStyle} aria-label="Time period filters">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8
          }}
        >
          <p style={{ margin: 0, color: '#a08060', fontSize: 12 }}>
            Timeline: {selectedLabel} ({visibleCount} / {totalCount})
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
            Clear
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gap: 8
          }}
        >
          <input
            type="range"
            min={0}
            max={PERIODS.length - 1}
            step={1}
            value={selectedIndex}
            onChange={(event) => setPeriodByIndex(Number(event.target.value))}
            onWheel={(event) => {
              event.preventDefault()
              const delta = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1
              setPeriodByIndex(selectedIndex + delta)
            }}
            role="slider"
            aria-label="Time period timeline"
            aria-valuemin={0}
            aria-valuemax={PERIODS.length - 1}
            aria-valuenow={selectedIndex}
            aria-valuetext={selectedLabel}
            style={{
              width: '100%',
              cursor: 'ew-resize',
              accentColor: '#d4a853'
            }}
          />
          <div
            aria-hidden="true"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${PERIODS.length}, minmax(0, 1fr))`,
              gap: 6
            }}
          >
            {PERIODS.map((period, idx) => (
              <div
                key={period}
                style={{
                  textAlign: 'center',
                  fontSize: 10,
                  color: idx === selectedIndex ? '#f5deb3' : '#a08060',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                title={period}
              >
                {period}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
