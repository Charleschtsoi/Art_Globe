/* global process */
/**
 * Host Kaggle6 artwork binaries for production or local static serving.
 * Prefers R2 when R2_* env vars are set; otherwise copies resized thumbs to public/artworks/kaggle6.
 *
 * Run: node scripts/host-kaggle6-images.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
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

function runNode(scriptRel, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(projectRoot, scriptRel)], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv }
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptRel} exited with code ${code}`))
    })
  })
}

async function fileExists(rel) {
  try {
    await fs.access(path.join(projectRoot, rel))
    return true
  } catch {
    return false
  }
}

async function main() {
  const validated = await fileExists('tmp/kaggle6-validated.json')
  if (!validated) {
    console.warn('Skip Kaggle6 hosting: tmp/kaggle6-validated.json missing (run kaggle6:validate first).')
    return
  }

  if (hasR2Config()) {
    console.log('R2 credentials detected — uploading Kaggle6 images to R2...')
    process.env.SUPABASE_DRY_RUN = 'false'
    await runNode('scripts/upload-kaggle6-images.mjs')
    await runNode('scripts/merge-kaggle6-into-external.mjs', {
      KAGGLE6_MERGE_INPUT: 'tmp/kaggle6-uploaded.json'
    })
    console.log('Kaggle6 R2 upload + merge complete.')
    return
  }

  console.log('No R2 credentials — copying Kaggle6 thumbnails to public/artworks/kaggle6...')
  await runNode('scripts/kaggle6-copy-images-local.mjs')
  if (await fileExists('scripts/merge-kaggle6-into-external.mjs')) {
    await runNode('scripts/merge-kaggle6-into-external.mjs', {
      KAGGLE6_MERGE_INPUT: 'tmp/kaggle6-local-for-merge.json'
    })
  }
  console.log('Kaggle6 local hosting complete (dev / static deploy with public/artworks).')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
