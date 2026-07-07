import { useEffect, useRef, useState } from 'react'
import { getCachedImageResult, preloadImageUrl } from '../lib/imageRequestQueue.js'
import { collectMarkerThumbUrls } from '../lib/markerThumbUrls.js'

const THUMB_THRESHOLD = 0.8
const BOOTSTRAP_TIMEOUT_MS = 12000
const VIEWPORT_PRELOAD_DEBOUNCE_MS = 300
const VIEWPORT_PRELOAD_BATCH = 48

/**
 * Preload marker thumbnail URLs once after artwork data is ready.
 * Unlocks globe interaction at 80% loaded or after timeout.
 * @param {Record<string, unknown>[]} markers
 * @param {boolean} dataReady
 * @param {{ onMarkersUpdated?: () => void }} [options]
 */
export function useMarkerThumbnailBootstrap(markers, dataReady, options = {}) {
  const { onMarkersUpdated } = options
  const onMarkersUpdatedRef = useRef(onMarkersUpdated)
  onMarkersUpdatedRef.current = onMarkersUpdated

  const [thumbProgress, setThumbProgress] = useState({ loaded: 0, total: 0 })
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [thumbReady, setThumbReady] = useState(false)
  const bootstrapDoneRef = useRef(false)
  const snapshotRef = useRef(/** @type {Record<string, unknown>[] | null} */ (null))
  const runIdRef = useRef(0)
  const viewportTimerRef = useRef(null)
  const bumpedForViewportRef = useRef(false)

  useEffect(() => {
    if (dataReady && !snapshotRef.current && Array.isArray(markers) && markers.length > 0) {
      snapshotRef.current = markers
    }
  }, [dataReady, markers])

  useEffect(() => {
    if (!dataReady) {
      setIsBootstrapping(false)
      setThumbReady(false)
      setThumbProgress({ loaded: 0, total: 0 })
      return undefined
    }

    if (bootstrapDoneRef.current) return undefined

    const snapshot = snapshotRef.current
    if (!snapshot || snapshot.length === 0) return undefined

    const urls = collectMarkerThumbUrls(snapshot)
    if (urls.length === 0) {
      bootstrapDoneRef.current = true
      setThumbReady(true)
      setIsBootstrapping(false)
      setThumbProgress({ loaded: 0, total: 0 })
      return undefined
    }

    const runId = ++runIdRef.current
    let resolved = 0
    let finished = false

    setIsBootstrapping(true)
    setThumbReady(false)
    setThumbProgress({ loaded: 0, total: urls.length })

    const finish = () => {
      if (finished || runId !== runIdRef.current) return
      finished = true
      bootstrapDoneRef.current = true
      setThumbReady(true)
      setIsBootstrapping(false)
      onMarkersUpdatedRef.current?.()
    }

    const onOneDone = () => {
      if (runId !== runIdRef.current) return
      resolved += 1
      setThumbProgress({ loaded: resolved, total: urls.length })
      if (resolved / urls.length >= THUMB_THRESHOLD) finish()
    }

    const timeout = window.setTimeout(finish, BOOTSTRAP_TIMEOUT_MS)

    for (const url of urls) {
      const cached = getCachedImageResult(url)
      if (cached === 'ok' || cached === 'error') {
        onOneDone()
        continue
      }
      preloadImageUrl(url).finally(onOneDone)
    }

    return () => {
      runIdRef.current += 1
      window.clearTimeout(timeout)
    }
  }, [dataReady])

  useEffect(() => {
    if (!dataReady || !bootstrapDoneRef.current) return undefined

    if (viewportTimerRef.current) window.clearTimeout(viewportTimerRef.current)
    viewportTimerRef.current = window.setTimeout(() => {
      const urls = collectMarkerThumbUrls(markers).filter((url) => !getCachedImageResult(url))
      if (urls.length === 0) return

      let loaded = 0
      const batch = urls.slice(0, VIEWPORT_PRELOAD_BATCH)
      for (const url of batch) {
        preloadImageUrl(url).then((ok) => {
          if (!ok) return
          loaded += 1
          if (loaded >= Math.ceil(batch.length * 0.25)) {
            onMarkersUpdatedRef.current?.()
          }
        })
      }
    }, VIEWPORT_PRELOAD_DEBOUNCE_MS)

    return () => {
      if (viewportTimerRef.current) window.clearTimeout(viewportTimerRef.current)
    }
  }, [dataReady, markers])

  return { isBootstrapping, thumbReady, thumbProgress }
}
