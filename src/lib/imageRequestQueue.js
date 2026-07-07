const MAX_CONCURRENT = 6

let active = 0
/** @type {Array<{ run: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }>} */
const queue = []

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
 * Preload an image URL via the queue; resolves true on load, false on error.
 * @param {string} url
 */
export function preloadImageUrl(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(false)
  return enqueueImageTask(
    () =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = url
      })
  )
}
