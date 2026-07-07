import assert from 'node:assert/strict'
import { collectMarkerThumbUrls } from '../src/lib/markerThumbUrls.js'

const markers = [
  {
    id: '1',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/example.jpg/256px-example.jpg',
    canonicalImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/example.jpg'
  },
  {
    id: '2',
    imageUrl: '/artworks/external/external-unavailable.svg'
  },
  {
    id: '3',
    imageUrl: '/artworks/foo.jpg'
  }
]

const urls = collectMarkerThumbUrls(markers)
assert.equal(urls.length, 1)
assert.ok(urls[0].startsWith('https://'))

console.log('markerThumbnailBootstrap: all assertions passed')
