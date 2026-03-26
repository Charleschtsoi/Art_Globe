const FALLBACK_MUSEUM_IMAGE = '/museums/default-museum.svg'

const MUSEUM_IMAGE_BY_NAME = {
  'tokyo national museum': '/museums/tokyo-national-museum.svg',
  'kyoto national museum': '/museums/default-museum.svg',
  'palace museum, beijing': '/museums/palace-museum-beijing.svg',
  'national palace museum': '/museums/national-palace-museum.svg',
  'shanghai museum': '/museums/shanghai-museum.svg',
  'national museum of korea': '/museums/national-museum-korea.svg',
  'museum of islamic art, doha': '/museums/default-museum.svg',
  'topkapi palace museum': '/museums/default-museum.svg',
  'museum of fine arts, boston': '/museums/default-museum.svg',
  'harvard art museums': '/museums/default-museum.svg'
}

export function normalizeMuseumName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
}

export function getMuseumImageUrl(museumName) {
  const normalized = normalizeMuseumName(museumName)
  return MUSEUM_IMAGE_BY_NAME[normalized] || FALLBACK_MUSEUM_IMAGE
}

export { FALLBACK_MUSEUM_IMAGE }
