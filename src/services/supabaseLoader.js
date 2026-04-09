import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const SUPABASE_TABLE = import.meta.env.VITE_SUPABASE_TABLE ?? 'artworks'
const DEFAULT_LIMIT = Number(import.meta.env.VITE_SUPABASE_DEFAULT_LIMIT ?? 3000)

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
}

function getClient() {
  assertConfigured()
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

function toArtworkRow(row) {
  return {
    id: row.source_id || row.id,
    title: row.title,
    artist: row.artist,
    museumName: row.museum_name,
    city: row.city,
    country: row.country,
    lat: Number(row.lat),
    lng: Number(row.lng),
    time_period: row.time_period || 'modern',
    source: row.source,
    year: row.year_text || 'Unknown',
    imageUrl: row.image_url || '',
    canonicalImageUrl: row.image_url || '',
    description: row.description ?? '',
    confidence: row.confidence
  }
}

const ARTWORK_SELECT =
  'source_id,title,artist,museum_name,city,country,lat,lng,time_period,source,year_text,image_url,confidence,description'

export async function fetchSupabaseInitialArtworks(limit = DEFAULT_LIMIT) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select(ARTWORK_SELECT)
    .eq('status', 'approved')
    .limit(limit)
  if (error) throw new Error(`Supabase request failed: ${error.message}`)
  return Array.isArray(data) ? data.map(toArtworkRow) : []
}

export async function fetchSupabaseSearchRecords(limit = DEFAULT_LIMIT) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select(
      'source_id,title,artist,museum_name,city,country,lat,lng,time_period,source,image_url,description'
    )
    .eq('status', 'approved')
    .limit(limit)
  if (error) throw new Error(`Supabase request failed: ${error.message}`)
  if (!Array.isArray(data)) return []
  return data.map((row) => ({
    id: row.source_id || row.id,
    title: row.title,
    artist: row.artist,
    museum: row.museum_name,
    city: row.city,
    country: row.country,
    lat: Number(row.lat),
    lng: Number(row.lng),
    timePeriod: row.time_period,
    source: row.source,
    imageUrl: row.image_url,
    canonicalImageUrl: row.image_url
  }))
}

export async function fetchSupabaseArtworksByPeriod(periods, limit = DEFAULT_LIMIT) {
  if (!Array.isArray(periods) || periods.length === 0) return fetchSupabaseInitialArtworks(limit)
  const supabase = getClient()
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select(ARTWORK_SELECT)
    .eq('status', 'approved')
    .in(
      'time_period',
      periods.map((p) => String(p).replace(/"/g, ''))
    )
    .limit(limit)
  if (error) throw new Error(`Supabase request failed: ${error.message}`)
  return Array.isArray(data) ? data.map(toArtworkRow) : []
}
