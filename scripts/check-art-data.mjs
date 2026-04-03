/* global process */
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'

const DATA_PATH = path.resolve(process.cwd(), 'src/data/externalArtData.json')
const LOCAL_ARTWORKS_DIR = path.resolve(process.cwd(), 'public/artworks')
const REQUIRED_FIELDS = ['id', 'title', 'artist', 'lat', 'lng', 'museum', 'description', 'imageUrl', 'priority']
const MAX_DUPLICATE_GROUPS = Number(process.env.MAX_DUPLICATE_IMAGE_GROUPS ?? 10)
const MAX_DUPLICATE_FILES = Number(process.env.MAX_DUPLICATE_IMAGE_FILES ?? 20)
const MIN_APAC_SHARE = Number(process.env.MIN_APAC_SHARE ?? 0.45)
const MIN_AFRICA_SHARE = Number(process.env.MIN_AFRICA_SHARE ?? 0.05)

const readData = async () => {
  const raw = await fs.readFile(DATA_PATH, 'utf8')
  return JSON.parse(raw)
}

const isValidUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false
  if (value.startsWith('/')) return true
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const hasHighResHint = (url) => {
  const m = String(url).match(/(\d+)px|width=(\d+)|height=(\d+)|(\d+)x(\d+)/i)
  if (!m) return true
  const nums = m.slice(1).filter(Boolean).map(Number)
  return nums.some((n) => n >= 300)
}

const hashFile = async (filePath) => {
  const data = await fs.readFile(filePath)
  return crypto.createHash('sha1').update(data).digest('hex')
}

const scanLocalDuplicateImages = async () => {
  const grouped = new Map()
  let files = []
  try {
    files = await fs.readdir(LOCAL_ARTWORKS_DIR)
  } catch {
    return {
      totalFiles: 0,
      duplicateGroups: [],
      duplicateFileCount: 0
    }
  }

  const imageFiles = files.filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  for (const name of imageFiles) {
    const fullPath = path.join(LOCAL_ARTWORKS_DIR, name)
    const hash = await hashFile(fullPath)
    if (!grouped.has(hash)) grouped.set(hash, [])
    grouped.get(hash).push(name)
  }

  const duplicateGroups = [...grouped.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)

  const duplicateFileCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0)
  return {
    totalFiles: imageFiles.length,
    duplicateGroups,
    duplicateFileCount
  }
}

const classifyRegion = (lat, lng) => {
  if (lat >= 17 && lat <= 56 && lng >= 98 && lng <= 151) return 'East Asia'
  // Australia & New Zealand (not covered by generic Asia box)
  if (lat >= -48 && lat <= -10 && lng >= 110 && lng <= 180) return 'Oceania'
  if (lat >= -12 && lat <= 60 && lng >= 25 && lng <= 170) return 'Asia'
  // Africa (rough bounding box; used only for dataset balance validation)
  if (lat >= -35 && lat <= 37 && lng >= -20 && lng <= 52) return 'Africa'
  if (lat >= 35 && lat <= 72 && lng >= -12 && lng <= 45) return 'Europe'
  if (lat >= -60 && lat <= 83 && lng >= -170 && lng <= -35) return 'Americas'
  return 'Other'
}

const run = async () => {
  const data = await readData()
  const localImageStats = await scanLocalDuplicateImages()
  if (!Array.isArray(data)) {
    console.error('ERROR: externalArtData.json must be an array')
    process.exit(1)
  }

  const errors = []
  const warnings = []
  const idSet = new Set()
  const titleMuseumSet = new Set()
  const regionCounts = {
    'East Asia': 0,
    Asia: 0,
    Oceania: 0,
    Africa: 0,
    Europe: 0,
    Americas: 0,
    Other: 0
  }

  data.forEach((item, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (item?.[field] === undefined || item?.[field] === null || item?.[field] === '') {
        errors.push(`row ${index}: missing required field "${field}"`)
      }
    }

    const lat = Number(item?.lat)
    const lng = Number(item?.lng)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`row ${index}: invalid lat "${item?.lat}"`)
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push(`row ${index}: invalid lng "${item?.lng}"`)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const region = classifyRegion(lat, lng)
      regionCounts[region] = (regionCounts[region] || 0) + 1
    }

    if (!isValidUrl(item?.imageUrl)) errors.push(`row ${index}: invalid imageUrl "${item?.imageUrl}"`)
    else if (!hasHighResHint(item?.imageUrl)) warnings.push(`row ${index}: imageUrl may be low-res "${item?.imageUrl}"`)

    if (typeof item?.description === 'string' && item.description.trim().length < 40) {
      warnings.push(`row ${index}: description is very short`)
    }

    const idKey = String(item?.id)
    if (idSet.has(idKey)) errors.push(`row ${index}: duplicate id "${idKey}"`)
    idSet.add(idKey)

    const tmKey = `${String(item?.title).toLowerCase()}::${String(item?.museum).toLowerCase()}`
    if (titleMuseumSet.has(tmKey)) warnings.push(`row ${index}: possible duplicate title+museum "${item?.title}"`)
    titleMuseumSet.add(tmKey)
  })

  console.log(`Checked ${data.length} records in ${path.relative(process.cwd(), DATA_PATH)}`)
  console.log(
    `Scanned ${localImageStats.totalFiles} local artwork files in ${path.relative(process.cwd(), LOCAL_ARTWORKS_DIR)}`
  )
  const apacCount =
    regionCounts['East Asia'] + regionCounts.Asia + regionCounts.Oceania
  const apacShare = data.length ? apacCount / data.length : 0

  const africaCount = regionCounts.Africa
  const africaShare = data.length ? africaCount / data.length : 0
  console.log(
    `Region distribution -> East Asia: ${regionCounts['East Asia']}, Asia: ${regionCounts.Asia}, Oceania: ${regionCounts.Oceania}, Africa: ${regionCounts.Africa}, Europe: ${regionCounts.Europe}, Americas: ${regionCounts.Americas}, Other: ${regionCounts.Other}`
  )
  console.log(`APAC share (East Asia + Asia + Oceania): ${(apacShare * 100).toFixed(1)}%`)
  console.log(`Africa share: ${(africaShare * 100).toFixed(1)}%`)
  /** Large Kaggle / museum imports often skew Western; treat as warnings unless MIN_* raised via env. */
  if (data.length > 0 && apacShare < MIN_APAC_SHARE) {
    warnings.push(
      `APAC share ${(apacShare * 100).toFixed(1)}% is below target ${(MIN_APAC_SHARE * 100).toFixed(1)}% (set MIN_APAC_SHARE=0 to silence)`
    )
  }
  if (data.length > 0 && africaShare < MIN_AFRICA_SHARE) {
    warnings.push(
      `Africa share ${(africaShare * 100).toFixed(1)}% is below target ${(MIN_AFRICA_SHARE * 100).toFixed(1)}% (set MIN_AFRICA_SHARE=0 to silence)`
    )
  }
  if (localImageStats.duplicateGroups.length) {
    warnings.push(
      `local image duplicates found: ${localImageStats.duplicateGroups.length} groups (${localImageStats.duplicateFileCount} files)`
    )
    localImageStats.duplicateGroups.slice(0, 10).forEach((group, idx) => {
      warnings.push(`duplicate group ${idx + 1} (${group.length} files): ${group.slice(0, 6).join(', ')}`)
    })
  }

  if (localImageStats.duplicateGroups.length > MAX_DUPLICATE_GROUPS) {
    errors.push(
      `duplicate local image groups (${localImageStats.duplicateGroups.length}) exceed threshold ${MAX_DUPLICATE_GROUPS}`
    )
  }
  if (localImageStats.duplicateFileCount > MAX_DUPLICATE_FILES) {
    errors.push(
      `duplicate local image files (${localImageStats.duplicateFileCount}) exceed threshold ${MAX_DUPLICATE_FILES}`
    )
  }
  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`)
    warnings.slice(0, 50).forEach((w) => console.log(` - ${w}`))
    if (warnings.length > 50) console.log(` - ... ${warnings.length - 50} more warnings`)
  }
  if (errors.length) {
    console.error(`Errors (${errors.length}):`)
    errors.slice(0, 100).forEach((e) => console.error(` - ${e}`))
    if (errors.length > 100) console.error(` - ... ${errors.length - 100} more errors`)
    process.exit(1)
  }
  console.log('Data quality check passed.')
}

run().catch((err) => {
  console.error('Failed to run data quality check:', err)
  process.exit(1)
})
