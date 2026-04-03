const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const SUPABASE_TABLE = import.meta.env.VITE_SUPABASE_TABLE ?? 'artworks'
const DEFAULT_LIMIT = Number(import.meta.env.VITE_SUPABASE_DEFAULT_LIMIT ?? 3000)

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
}

async function fetchRest(pathWithQuery) {
  assertConfigured()
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  })
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`)
  return response.json()
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
    description: '',
    confidence: row.confidence
  }
}

export async function fetchSupabaseInitialArtworks(limit = DEFAULT_LIMIT) {
  const query = `${SUPABASE_TABLE}?select=source_id,title,artist,museum_name,city,country,lat,lng,time_period,source,year_text,image_url,confidence&limit=${encodeURIComponent(limit)}`
  const rows = await fetchRest(query)
  return Array.isArray(rows) ? rows.map(toArtworkRow) : []
}

export async function fetchSupabaseSearchRecords(limit = DEFAULT_LIMIT) {
  const query = `${SUPABASE_TABLE}?select=source_id,title,artist,museum_name,city,country,lat,lng,time_period,source,image_url&limit=${encodeURIComponent(limit)}`
  const rows = await fetchRest(query)
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
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
  const inClause = periods.map((p) => `"${String(p).replace(/"/g, '')}"`).join(',')
  const query = `${SUPABASE_TABLE}?select=source_id,title,artist,museum_name,city,country,lat,lng,time_period,source,year_text,image_url,confidence&time_period=in.(${encodeURIComponent(inClause)})&limit=${encodeURIComponent(limit)}`
  const rows = await fetchRest(query)
  return Array.isArray(rows) ? rows.map(toArtworkRow) : []
}

