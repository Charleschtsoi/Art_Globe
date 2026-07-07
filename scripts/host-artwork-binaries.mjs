/* global process */
/**
 * Upload public/artworks to R2 when configured, then rewrite CDN URLs in data files.
 * Run: node scripts/host-artwork-binaries.mjs
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const node = process.execPath

function hasR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL
  )
}

function runNode(scriptRel) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(projectRoot, scriptRel)], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptRel} exited with code ${code}`))
    })
  })
}

async function main() {
  if (!hasR2Config()) {
    console.warn(
      'Skip R2 artwork upload: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL in .env'
    )
    console.warn('Local /artworks paths still work in `npm run dev` without R2.')
    return
  }

  console.log('Uploading public/artworks/* to R2...')
  await runNode('scripts/upload-all-images-to-r2.mjs')
  console.log('Rewriting data files to CDN URLs...')
  await runNode('scripts/rewrite-image-urls-for-cdn.mjs')
  console.log('Artwork R2 hosting complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
