/* global process */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TRANSIENT_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EAI_AGAIN'
])

function collectErrorCodes(err, seen = new Set()) {
  if (!err || typeof err !== 'object') return []
  if (seen.has(err)) return []
  seen.add(err)
  const codes = []
  if (typeof err.code === 'string') codes.push(err.code)
  if (err.name === 'AggregateError' && Array.isArray(err.errors)) {
    for (const sub of err.errors) {
      codes.push(...collectErrorCodes(sub, seen))
    }
  }
  if (err.cause) {
    codes.push(...collectErrorCodes(err.cause, seen))
  }
  return codes
}

function isTransientNetworkError(err) {
  if (!err) return false
  if (err.name === 'AbortError') return true
  return collectErrorCodes(err).some((c) => TRANSIENT_NETWORK_CODES.has(c))
}

function parseRetryAfterMs(response) {
  const raw = response.headers.get('retry-after')
  if (!raw) return null
  const sec = Number(raw)
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000
  const t = Date.parse(raw)
  if (Number.isFinite(t)) return Math.max(0, t - Date.now())
  return null
}

/**
 * @param {object} options
 * @param {string} options.userAgent
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries] — default from WIKIMEDIA_FETCH_MAX_RETRIES or 6
 * @param {number} [options.initialBackoffMs] — default from WIKIMEDIA_FETCH_INITIAL_BACKOFF_MS or 1000
 * @param {number} [options.maxBackoffMs] — default from WIKIMEDIA_FETCH_MAX_BACKOFF_MS or 32000
 * @param {number} [options.minIntervalMs] — minimum ms between successful requests (default 0)
 */
export function createFetchJsonRetry(options = {}) {
  const userAgent = options.userAgent
  if (!userAgent) throw new Error('createFetchJsonRetry: userAgent is required')

  const timeoutMs = Number(options.timeoutMs ?? 8000)
  const maxRetries = Number(
    options.maxRetries ?? process.env.WIKIMEDIA_FETCH_MAX_RETRIES ?? 6
  )
  const initialBackoffMs = Number(
    options.initialBackoffMs ?? process.env.WIKIMEDIA_FETCH_INITIAL_BACKOFF_MS ?? 1000
  )
  const maxBackoffMs = Number(
    options.maxBackoffMs ?? process.env.WIKIMEDIA_FETCH_MAX_BACKOFF_MS ?? 32000
  )
  const minIntervalMs = Number(options.minIntervalMs ?? process.env.WIKIMEDIA_FETCH_MIN_INTERVAL_MS ?? 0)

  let lastSuccessEnd = 0

  return async function fetchJsonRetry(url) {
    if (minIntervalMs > 0 && lastSuccessEnd > 0) {
      const wait = minIntervalMs - (Date.now() - lastSuccessEnd)
      if (wait > 0) await sleep(wait)
    }

    let backoff = initialBackoffMs

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        let response
        try {
          response = await fetch(url, {
            headers: { 'User-Agent': userAgent },
            signal: controller.signal
          })
        } catch (networkErr) {
          if (attempt >= maxRetries || !isTransientNetworkError(networkErr)) {
            throw networkErr
          }
          const waitMs = Math.min(backoff, maxBackoffMs)
          await sleep(waitMs)
          backoff = Math.min(backoff * 2, maxBackoffMs)
          continue
        }

        if (response.ok) {
          const data = await response.json()
          lastSuccessEnd = Date.now()
          return data
        }

        const retryable = response.status === 429 || response.status === 503 || response.status === 502
        if (!retryable) {
          throw new Error(`request failed ${response.status} for ${url}`)
        }
        if (attempt >= maxRetries) {
          throw new Error(`request failed ${response.status} after ${maxRetries} attempts for ${url}`)
        }

        const ra = parseRetryAfterMs(response)
        const waitMs = ra != null ? Math.min(ra, maxBackoffMs) : Math.min(backoff, maxBackoffMs)
        await sleep(waitMs)
        backoff = Math.min(backoff * 2, maxBackoffMs)
      } finally {
        clearTimeout(timer)
      }
    }

    throw new Error(`request failed after ${maxRetries} attempts for ${url}`)
  }
}
