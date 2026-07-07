export function trackEvent(name, props = {}) {
  if (typeof window === 'undefined') return
  try {
    if (typeof window.va === 'function') {
      window.va('event', { name, ...props })
    }
    if (import.meta.env.DEV) {
      console.debug('[analytics]', name, props)
    }
  } catch {
    /* ignore */
  }
}

export function trackPageView(path) {
  trackEvent('page_view', { path })
}

export function trackCta(action, destination) {
  trackEvent('cta_click', { action, destination })
}
