import assert from 'node:assert/strict'
import {
  collectImageCandidates,
  detectImageProvider,
  resizeImageUrl,
  resolveArtworkImageUrl
} from '../src/lib/imageResolver.js'

const wiki =
  'https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=640'
assert.equal(detectImageProvider(wiki), 'wikimedia')
assert.equal(resizeImageUrl(wiki, 'thumb'), wiki.replace('width=640', 'width=256'))

const iiif =
  'https://example.org/iiif/2/abc/full/800,/0/default.jpg'
assert.equal(detectImageProvider(iiif), 'iiif')
assert.equal(
  resizeImageUrl(iiif, 'thumb'),
  'https://example.org/iiif/2/abc/full/256,/0/default.jpg'
)

const art = {
  imageUrl: '/artworks/art-1.jpg',
  canonicalImageUrl: wiki,
  assets: { thumbnail_url: '/artworks/art-1.jpg', high_res_url: wiki }
}
assert.ok(collectImageCandidates(art).includes(wiki.replace('width=640', 'width=640')))
const resolved = resolveArtworkImageUrl(art, { size: 'thumb' })
assert.ok(resolved.startsWith('https://commons.wikimedia.org'))
assert.ok(resolved.includes('width=256'))

console.log('imageResolver tests passed')
