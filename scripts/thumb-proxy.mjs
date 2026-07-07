/* global process */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PORT = Number(process.env.THUMB_PROXY_PORT ?? 4177)
const CACHE_DIR = path.resolve(process.cwd(), 'public/artworks-cache')
const USER_AGENT = 'ArtGlobeThumbProxy/1.0 (local cache service)'

const send = (res, status, body, type = 'text/plain') => {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'public, max-age=86400'
  })
  res.end(body)
}

const ensureCacheDir = async () => {
  await fs.mkdir(CACHE_DIR, { recursive: true })
}

const hashKey = (url, width) => crypto.createHash('sha1').update(`${url}|${width}`).digest('hex')

const download = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw new Error(`invalid content type: ${contentType}`)
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const buf = Buffer.from(await res.arrayBuffer())
  return { buf, ext, contentType }
}

const withSizedUrl = (rawUrl, width) => {
  const url = String(rawUrl).replace(/^http:\/\//i, 'https://')
  if (url.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
    return url.includes('?width=') ? url : `${url}?width=${width}`
  }
  return url
}

await ensureCacheDir()

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://localhost:${PORT}`)
    if (requestUrl.pathname !== '/thumb') {
      send(res, 404, 'Not found')
      return
    }
    const remoteUrl = requestUrl.searchParams.get('url')
    const width = Number(requestUrl.searchParams.get('w') || '256')
    if (!remoteUrl) {
      send(res, 400, 'Missing url')
      return
    }
    const normalized = withSizedUrl(remoteUrl, width)
    const key = hashKey(normalized, width)
    const candidates = ['jpg', 'png', 'webp'].map((ext) => path.join(CACHE_DIR, `${key}.${ext}`))
    for (const candidate of candidates) {
      try {
        const body = await fs.readFile(candidate)
        const ext = path.extname(candidate).slice(1)
        const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        send(res, 200, body, type)
        return
      } catch {
        // cache miss
      }
    }
    const { buf, ext, contentType } = await download(normalized)
    const cachePath = path.join(CACHE_DIR, `${key}.${ext}`)
    await fs.writeFile(cachePath, buf)
    send(res, 200, buf, contentType)
  } catch (error) {
    send(res, 502, `Proxy error: ${error.message}`)
  }
})

server.listen(PORT, () => {
  process.stdout.write(`Thumbnail proxy running at http://localhost:${PORT}/thumb?url=<encoded>&w=256\n`)
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
