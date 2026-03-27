/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const manifestPath = path.resolve(root, 'public/data/chunks/manifest.json')
const searchIndexPath = path.resolve(root, 'public/data/search-index.json')
const distDir = path.resolve(root, 'dist/assets')

const kb = (n) => Math.round((n / 1024) * 10) / 10

async function sizeOf(filePath) {
  const raw = await fs.readFile(filePath)
  return {
    bytes: raw.length,
    gzipBytes: gzipSync(raw).length
  }
}

async function maybeBiggestBundle() {
  try {
    const files = await fs.readdir(distDir)
    const jsFiles = files.filter((f) => f.endsWith('.js'))
    if (!jsFiles.length) return null
    let largest = null
    for (const name of jsFiles) {
      const full = path.resolve(distDir, name)
      const s = await sizeOf(full)
      if (!largest || s.bytes > largest.bytes) largest = { file: name, ...s }
    }
    return largest
  } catch {
    return null
  }
}

async function main() {
  const manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const searchRaw = JSON.parse(await fs.readFile(searchIndexPath, 'utf8'))
  const manifestSize = await sizeOf(manifestPath)
  const searchSize = await sizeOf(searchIndexPath)
  const biggestBundle = await maybeBiggestBundle()

  const sampleChunk = manifestRaw.chunks?.[0]
  const sampleChunkSize = sampleChunk ? await sizeOf(path.resolve(root, `public${sampleChunk.path}`)) : null

  const report = {
    generatedAt: new Date().toISOString(),
    manifest: {
      totalRecords: manifestRaw.totalRecords,
      totalChunks: manifestRaw.totalChunks,
      sizeKb: kb(manifestSize.bytes),
      gzipKb: kb(manifestSize.gzipBytes)
    },
    searchIndex: {
      totalRecords: searchRaw.totalRecords,
      sizeKb: kb(searchSize.bytes),
      gzipKb: kb(searchSize.gzipBytes)
    },
    sampleChunk: sampleChunk
      ? {
          id: sampleChunk.id,
          count: sampleChunk.count,
          sizeKb: kb(sampleChunkSize.bytes),
          gzipKb: kb(sampleChunkSize.gzipBytes)
        }
      : null,
    largestBundle: biggestBundle
      ? {
          file: biggestBundle.file,
          sizeKb: kb(biggestBundle.bytes),
          gzipKb: kb(biggestBundle.gzipBytes)
        }
      : null
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
