/* global process */
/**
 * Prints counts from tmp pipeline outputs, merge reports, and public manifest.
 * Use after import/validate/upload/merge/data:runtime to verify throughput.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function readJsonIfExists(rel) {
  const p = path.resolve(root, rel)
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function line(label, value) {
  console.log(`${label.padEnd(36)} ${value}`)
}

async function main() {
  const v6 = await readJsonIfExists('tmp/kaggle6-validated.json')
  const up6 = await readJsonIfExists('tmp/kaggle6-uploaded.json')
  const loc6 = await readJsonIfExists('tmp/kaggle6-local-for-merge.json')
  const v2 = await readJsonIfExists('tmp/kaggle2-validated.json')
  const m6 = await readJsonIfExists('scripts/reports/kaggle6-merge-report.json')
  const m2 = await readJsonIfExists('scripts/reports/kaggle2-merge-report.json')
  const manifest = await readJsonIfExists('public/data/chunks/manifest.json')

  console.log('--- tmp pipeline outputs ---')
  line(
    'kaggle6-validated accepted',
    v6?.accepted != null ? String(v6.accepted.length) : '(missing)'
  )
  line(
    'kaggle6-uploaded records',
    up6?.records != null ? String(up6.records.length) : '(missing)'
  )
  line(
    'kaggle6-local-for-merge records',
    loc6?.records != null ? String(loc6.records.length) : '(missing)'
  )
  line(
    'kaggle2-validated accepted',
    v2?.accepted != null ? String(v2.accepted.length) : '(missing)'
  )

  console.log('')
  console.log('--- last merge reports ---')
  line('kaggle6 merge importedCount', m6?.importedCount != null ? String(m6.importedCount) : '(missing)')
  line('kaggle2 merge importedCount', m2?.importedCount != null ? String(m2.importedCount) : '(missing)')

  console.log('')
  console.log('--- built static runtime ---')
  line(
    'manifest totalRecords',
    manifest?.totalRecords != null ? String(manifest.totalRecords) : '(missing — run npm run data:runtime)'
  )
  line('manifest totalChunks', manifest?.totalChunks != null ? String(manifest.totalChunks) : '(missing)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
