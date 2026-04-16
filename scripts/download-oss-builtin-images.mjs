/* global process */
/**
 * Downloads small showcase rasters committed to the repo:
 * - art-1.jpg … from Wikidata P18 (builtin western canon in src/artData.js)
 * - Eastern entries that use local /artworks/asia/* paths → from canonicalImageUrl (Commons)
 *
 * Requires network. Re-run after changing builtin artwork rows.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artworks, easternArtData } from '../src/artData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const UA =
  'ArtGlobeShowcaseBot/1.0 (https://github.com/Charleschtsoi/Art_Globe; educational thumbnail fetch)'

function qFromSourceUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/entity\/(Q\d+)/i)
  return m ? m[1] : null
}

async function commonsThumbFromFilename(fileTitle) {
  const name = fileTitle.startsWith('File:') ? fileTitle.slice(5) : fileTitle
  const enc = encodeURIComponent(name)
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=480`
}

async function wbgetentities(ids) {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbgetentities')
  url.searchParams.set('ids', ids.join('|'))
  url.searchParams.set('props', 'claims')
  url.searchParams.set('format', 'json')
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`wbgetentities ${res.status}`)
  return res.json()
}

function p18Filename(entity) {
  const claims = entity?.claims?.P18
  if (!claims?.length) return null
  const snak = claims[0]?.mainsnak
  if (snak?.snaktype !== 'value' || !snak?.datavalue?.value) return null
  return String(snak.datavalue.value)
}

async function downloadToFile(imageUrl, destAbs) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`GET ${imageUrl} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(destAbs), { recursive: true })
  await fs.writeFile(destAbs, buf)
}

async function main() {
  const byQ = new Map()
  for (const a of artworks) {
    const q = qFromSourceUrl(a.sourceUrl)
    if (!q) continue
    if (!byQ.has(q)) byQ.set(q, [])
    byQ.get(q).push(a)
  }

  const ids = [...byQ.keys()]
  const batch = 45
  const p18ByQ = new Map()

  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch)
    const data = await wbgetentities(slice)
    const entities = data.entities ?? {}
    for (const id of slice) {
      const fn = p18Filename(entities[id])
      if (fn) p18ByQ.set(id, fn)
    }
    await new Promise((r) => setTimeout(r, 150))
  }

  let ok = 0
  let missing = 0

  for (const a of artworks) {
    const rel = a.imageUrl
    if (!rel?.startsWith('/artworks/_oss/art-')) continue
    const dest = path.resolve(projectRoot, 'public', rel.replace(/^\//, ''))
    const q = qFromSourceUrl(a.sourceUrl)
    const fn = q ? p18ByQ.get(q) : null
    if (!fn) {
      console.warn('No P18 for', a.id, q)
      missing += 1
      continue
    }
    const thumb = await commonsThumbFromFilename(fn)
    await downloadToFile(thumb, dest)
    ok += 1
    console.log('saved', rel)
  }

  for (const e of easternArtData) {
    const rel = e.imageUrl
    if (!rel?.startsWith('/artworks/')) continue
    const canon = e.canonicalImageUrl
    if (!canon?.startsWith('http')) continue
    const dest = path.resolve(projectRoot, 'public', rel.replace(/^\//, ''))
    await downloadToFile(canon, dest)
    console.log('saved', rel)
  }

  console.log(`\nBuiltin Wikidata thumbnails: ${ok} saved, ${missing} missing P18 (fix manually).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
