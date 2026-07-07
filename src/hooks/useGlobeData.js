import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyRegionForCoords,
  fetchChunkManifest,
  fetchChunkRecords,
  fetchSearchIndex,
  getChunkIdsForRegion
} from '../services/runtimeDataLoader'
import { fetchSupabaseInitialArtworks, fetchSupabaseSearchRecords } from '../services/supabaseLoader'

const HYDRATION_BATCH_SIZE = Number(import.meta.env.VITE_HYDRATION_BATCH_SIZE ?? 1)
const HYDRATION_BATCH_DELAY_MS = Number(import.meta.env.VITE_HYDRATION_BATCH_DELAY_MS ?? 220)
const DATA_SOURCE = String(import.meta.env.VITE_DATA_SOURCE ?? 'static').toLowerCase()

export function useGlobeData() {
  const [allArtworksBase, setAllArtworksBase] = useState([])
  const [searchRecords, setSearchRecords] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState(null)
  const [totalRecords, setTotalRecords] = useState(0)
  const [searchIndexLoading, setSearchIndexLoading] = useState(false)

  const dataManifestRef = useRef(null)
  const loadedChunkIdsRef = useRef(new Set())
  const loadingChunkIdsRef = useRef(new Set())
  const currentPovRegionRef = useRef('asia')
  const hydrationTimerRef = useRef(null)
  const searchIndexLoadedRef = useRef(false)
  const searchIndexLoadingRef = useRef(false)

  const loadChunksById = useCallback(async (chunkIds = []) => {
    const manifest = dataManifestRef.current
    if (!manifest?.chunks || chunkIds.length === 0) return []
    const pendingIds = chunkIds.filter(
      (id) => !loadedChunkIdsRef.current.has(id) && !loadingChunkIdsRef.current.has(id)
    )
    if (pendingIds.length === 0) return []
    for (const chunkId of pendingIds) loadingChunkIdsRef.current.add(chunkId)
    const chunkById = new Map(manifest.chunks.map((chunk) => [chunk.id, chunk]))
    const loaded = await Promise.all(
      pendingIds.map(async (chunkId) => {
        try {
          const chunk = chunkById.get(chunkId)
          if (!chunk?.path) return []
          const records = await fetchChunkRecords(chunk.path)
          loadedChunkIdsRef.current.add(chunkId)
          return records
        } finally {
          loadingChunkIdsRef.current.delete(chunkId)
        }
      })
    )
    const flat = loaded.flat()
    if (flat.length > 0) {
      setAllArtworksBase((prev) => {
        const next = [...prev]
        const known = new Set(prev.map((row) => String(row.id)))
        for (const row of flat) {
          const id = String(row.id ?? row.artwork_id ?? '')
          if (!id || known.has(id)) continue
          known.add(id)
          next.push(row)
        }
        return next
      })
    }
    return flat
  }, [])

  const startProgressiveGlobalHydration = useCallback(() => {
    const manifest = dataManifestRef.current
    if (!manifest?.chunks?.length) return
    const currentRegion = currentPovRegionRef.current
    const chunks = manifest.chunks
    const prioritized = [
      ...chunks.filter((chunk) => chunk.region === currentRegion),
      ...chunks.filter((chunk) => chunk.region !== currentRegion)
    ].map((chunk) => chunk.id)
    let cursor = 0

    const tick = async () => {
      if (cursor >= prioritized.length) return
      const nextIds = prioritized.slice(cursor, cursor + HYDRATION_BATCH_SIZE)
      cursor += HYDRATION_BATCH_SIZE
      try {
        await loadChunksById(nextIds)
      } catch (error) {
        console.warn('Global hydration batch failed:', error)
      }
      hydrationTimerRef.current = window.setTimeout(tick, HYDRATION_BATCH_DELAY_MS)
    }
    hydrationTimerRef.current = window.setTimeout(tick, HYDRATION_BATCH_DELAY_MS)
  }, [loadChunksById])

  const loadSearchIndexLazy = useCallback(async () => {
    if (searchIndexLoadedRef.current || searchIndexLoadingRef.current) return
    if (DATA_SOURCE === 'supabase') return
    searchIndexLoadingRef.current = true
    setSearchIndexLoading(true)
    try {
      const search = await fetchSearchIndex()
      setSearchRecords(Array.isArray(search?.records) ? search.records : [])
      searchIndexLoadedRef.current = true
    } catch (error) {
      console.warn('Search index lazy-load failed:', error)
    } finally {
      searchIndexLoadingRef.current = false
      setSearchIndexLoading(false)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const bootstrapData = async () => {
      setDataLoading(true)
      setDataError(null)
      try {
        if (DATA_SOURCE === 'supabase') {
          const [records, search] = await Promise.all([
            fetchSupabaseInitialArtworks(),
            fetchSupabaseSearchRecords()
          ])
          if (disposed) return
          setAllArtworksBase(Array.isArray(records) ? records : [])
          setSearchRecords(Array.isArray(search) ? search : [])
          setTotalRecords(Array.isArray(records) ? records.length : 0)
          searchIndexLoadedRef.current = true
          return
        }
        const manifest = await fetchChunkManifest()
        if (disposed) return
        dataManifestRef.current = manifest
        setTotalRecords(manifest?.totalRecords ?? 0)
        const initialChunkIds = getChunkIdsForRegion(manifest, currentPovRegionRef.current, 3)
        await loadChunksById(initialChunkIds)
        if (disposed) return
        startProgressiveGlobalHydration()
      } catch (error) {
        console.error('Runtime data bootstrap failed:', error)
        if (!disposed) setDataError(error)
      } finally {
        if (!disposed) setDataLoading(false)
      }
    }
    bootstrapData()
    return () => {
      disposed = true
      if (hydrationTimerRef.current) window.clearTimeout(hydrationTimerRef.current)
    }
  }, [loadChunksById, startProgressiveGlobalHydration])

  const maybePreloadRegion = useCallback(
    (lat, lng, altitude) => {
      const manifest = dataManifestRef.current
      if (!manifest) return
      const region = classifyRegionForCoords(lat, lng)
      currentPovRegionRef.current = region
      const count = altitude > 1.5 ? 2 : 4
      const candidateChunkIds = getChunkIdsForRegion(manifest, region, count)
      loadChunksById(candidateChunkIds).catch((error) => {
        console.warn('Chunk preload failed:', error)
      })
    },
    [loadChunksById]
  )

  return {
    allArtworksBase,
    setAllArtworksBase,
    searchRecords,
    dataLoading,
    dataError,
    totalRecords,
    searchIndexLoading,
    loadChunksById,
    loadSearchIndexLazy,
    maybePreloadRegion,
    dataManifestRef
  }
}
