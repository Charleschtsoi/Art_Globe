const USER_AGENT = 'ArtGlobeCommonsResolver/1.0 (educational project)'

export function fileNameFromFilePathUrl(url) {
  const match = String(url ?? '').match(/Special:FilePath\/([^?#]+)/i)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/**
 * @param {string} fileName Commons file name (with or without "File:" prefix)
 * @param {number} [width=640]
 */
export async function resolveCommonsThumbUrl(fileName, width = 640) {
  const raw = String(fileName ?? '').trim()
  if (!raw) return ''
  const base = raw.startsWith('File:') ? raw.slice(5) : raw
  const title = `File:${base}`
  const api =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo` +
    `&titles=${encodeURIComponent(title)}&iiprop=url&iiurlwidth=${width}`

  const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return ''
  const json = await res.json()
  const pages = json?.query?.pages
  if (!pages || typeof pages !== 'object') return ''
  const page = Object.values(pages)[0]
  if (!page || page.missing !== undefined) return ''
  const info = page.imageinfo?.[0]
  return String(info?.thumburl || info?.url || '').trim()
}

/**
 * Resolve Special:FilePath or raw file name to upload.wikimedia.org thumb URL.
 * @param {string} urlOrFileName
 * @param {number} [width=640]
 */
export async function resolveCommonsImageUrl(urlOrFileName, width = 640) {
  const input = String(urlOrFileName ?? '').trim()
  if (!input) return ''
  if (input.includes('upload.wikimedia.org')) return input
  const fileName = input.includes('Special:FilePath/')
    ? fileNameFromFilePathUrl(input)
    : input
  if (!fileName) return ''
  return resolveCommonsThumbUrl(fileName, width)
}
