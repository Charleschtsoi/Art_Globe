import { useEffect, useState } from 'react'

const STORAGE_KEY = 'art-globe-onboarding-done'

const STEPS = [
  { key: 'onboarding.step1', position: 'center' },
  { key: 'onboarding.step2', position: 'left' },
  { key: 'onboarding.step3', position: 'bottom-left' }
]

export function OnboardingCoach({ t, onDismiss }) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
      setVisible(true)
    } catch {
      /* ignore */
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
    onDismiss?.()
  }

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss()
      return
    }
    setStep((s) => s + 1)
  }

  if (!visible) return null

  const current = STEPS[step]
  const positionStyles = {
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    left: { top: 120, left: 16 },
    'bottom-left': { bottom: 200, left: 16 }
  }

  return (
    <>
      <div
        role="presentation"
        onClick={next}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10040,
          background: 'rgba(4, 8, 20, 0.55)',
          pointerEvents: 'auto'
        }}
      />
      <div
        role="dialog"
        aria-labelledby="onboarding-title"
        style={{
          position: 'fixed',
          ...positionStyles[current.position],
          zIndex: 10045,
          maxWidth: 300,
          background: 'rgba(32, 22, 14, 0.96)',
          border: '1px solid rgba(212, 168, 83, 0.45)',
          borderRadius: 12,
          padding: '16px 18px',
          color: '#f5e6c8',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          pointerEvents: 'auto'
        }}
      >
        <p id="onboarding-title" style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
          {t(current.key)}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 11, color: '#a08060' }}>
            {step + 1} / {STEPS.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#a08060',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {t('onboarding.skip')}
            </button>
            <button
              type="button"
              onClick={next}
              style={{
                border: '1px solid #d4a853',
                background: 'rgba(212, 168, 83, 0.15)',
                color: '#f5e6c8',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {step >= STEPS.length - 1 ? t('onboarding.done') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
