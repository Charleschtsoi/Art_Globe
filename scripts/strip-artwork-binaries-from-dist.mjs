/* global process */
/**
 * Remove raster images from dist/artworks after vite build so deploy size stays small
 * when artwork URLs already point at R2/CDN. Keeps .svg and directory structure.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const DIST_ARTWORKS = path.resolve(process.cwd(), 'dist/artworks')

const REMOVE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

async function walkRemove(dir) {
  let removed = 0
  let bytes = 0
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return { removed, bytes }
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      const sub = await walkRemove(full)
      removed += sub.removed
      bytes += sub.bytes
    } else {
      const ext = path.extname(ent.name).toLowerCase()
      if (REMOVE_EXT.has(ext)) {
        const st = await fs.stat(full)
        await fs.unlink(full)
        removed += 1
        bytes += st.size
      }
    }
  }
  return { removed, bytes }
}

async function main() {
  const { removed, bytes } = await walkRemove(DIST_ARTWORKS)
  console.log(
    `strip-artwork-binaries-from-dist: removed ${removed} files (${(bytes / 1024 / 1024).toFixed(1)} MB) under dist/artworks`
  )
  if (removed === 0) {
    console.warn('No binary files removed. Run vite build first, or dist/artworks is empty.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
