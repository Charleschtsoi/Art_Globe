const MAX_CONCURRENT = 6

let active = 0
/** @type {Array<{ run: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }>} */
const queue = []

/** @type {Map<string, 'ok' | 'error'>} */
const resultCache = new Map()

/** @type {Map<string, Promise<boolean>>} */
const inflight = new Map()

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()
    if (!job) break
    active += 1
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1
        pump()
      })
  }
}

/**
 * Run an async task with at most MAX_CONCURRENT in flight.
 * @template T
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export function enqueueImageTask(run) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject })
    pump()
  })
}

/**
 * @param {string} url
 * @returns {'ok' | 'error' | undefined}
 */
export function getCachedImageResult(url) {
  if (!url || typeof url !== 'string') return undefined
  return resultCache.get(url)
}

/**
 * Preload an image URL via the queue; resolves true on load, false on error.
 * Results are cached and in-flight requests are deduplicated per URL.
 * @param {string} url
 */
export function preloadImageUrl(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(false)

  const cached = resultCache.get(url)
  if (cached === 'ok') return Promise.resolve(true)
  if (cached === 'error') return Promise.resolve(false)

  const pending = inflight.get(url)
  if (pending) return pending

  const promise = enqueueImageTask(
    () =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = url
      })
  ).then((ok) => {
    resultCache.set(url, ok ? 'ok' : 'error')
    inflight.delete(url)
    return ok
  })

  inflight.set(url, promise)
  return promise
}
