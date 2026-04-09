/**
 * Forward-geocode a place name via OpenStreetMap Nominatim (client-side).
 * @param {string} query
 * @returns {Promise<{ lat: number, lng: number, city: string, country: string, displayName: string }>}
 */
export async function geocodeLocationQuery(query) {
  const q = String(query ?? '').trim()
  if (!q) throw new Error('empty_location')

  const path = `/search?format=json&limit=1&q=${encodeURIComponent(q)}`
  const url =
    typeof import.meta !== 'undefined' && import.meta.env?.DEV
      ? `/nominatim${path}`
      : `https://nominatim.openstreetmap.org${path}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })
  if (!res.ok) throw new Error(`geocode_http_${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('location_not_found')
  }

  const hit = data[0]
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('location_not_found')
  }

  const addr = hit.address && typeof hit.address === 'object' ? hit.address : {}
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.county ||
    addr.state ||
    ''
  const country = addr.country || ''

  return {
    lat,
    lng,
    city: city || q.split(',')[0]?.trim() || q,
    country: country || '',
    displayName: String(hit.display_name || q)
  }
}
