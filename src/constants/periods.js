/** Stable filter keys; labels come from i18n. */
export const PERIOD_KEYS = [
  'antiquity',
  'middle_ages',
  'renaissance',
  'baroque',
  'impressionism',
  'modern',
  'contemporary'
]

/** Legacy English labels saved in older data or code paths. */
export const LEGACY_EN_PERIOD_TO_KEY = {
  Antiquity: 'antiquity',
  'Middle Ages': 'middle_ages',
  Renaissance: 'renaissance',
  Baroque: 'baroque',
  Impressionism: 'impressionism',
  Modern: 'modern',
  Contemporary: 'contemporary'
}

export function toPeriodKey(value) {
  if (value === undefined || value === null || value === '') return null
  const s = String(value)
  if (PERIOD_KEYS.includes(s)) return s
  return LEGACY_EN_PERIOD_TO_KEY[s] ?? null
}

export function deriveTimePeriodKey(yearLike) {
  const num = Number(yearLike)
  const year = Number.isFinite(num) ? num : null
  if (year === null) return 'modern'
  if (year < 500) return 'antiquity'
  if (year < 1400) return 'middle_ages'
  if (year < 1600) return 'renaissance'
  if (year < 1750) return 'baroque'
  if (year < 1900) return 'impressionism'
  if (year < 1970) return 'modern'
  return 'contemporary'
}
