import assert from 'node:assert/strict'
import {
  canonicalizeRemoteImageUrl,
  collectImageCandidates,
  detectImageProvider,
  resizeImageUrl,
  resolveArtworkImageCandidates,
  resolveArtworkImageUrl
} from '../src/lib/imageResolver.js'

const wiki =
  'https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=640'
assert.equal(detectImageProvider(wiki), 'wikimedia')
assert.equal(resizeImageUrl(wiki, 'thumb'), wiki.replace('width=640', 'width=256'))
assert.equal(canonicalizeRemoteImageUrl(wiki, 'thumb'), wiki.replace('width=640', 'width=256'))

const uploadWiki =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/800px-Example.jpg'
assert.equal(
  canonicalizeRemoteImageUrl(uploadWiki, 'thumb'),
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/256px-Example.jpg'
)

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

const brokenPrimary = {
  id: 'broken-1',
  assets: {
    availability: 'broken',
    thumbnail_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Broken.jpg',
    sources: [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bo/Alt.jpg/640px-Alt.jpg' }
    ]
  },
  canonicalImageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Broken.jpg'
}
const brokenCandidates = resolveArtworkImageCandidates(brokenPrimary, 'thumb')
assert.equal(brokenCandidates.length, 1)
assert.ok(brokenCandidates[0].includes('upload.wikimedia.org'))
assert.ok(!brokenCandidates[0].includes('Broken.jpg'))

const preferUpload = {
  assets: {
    thumbnail_url: wiki,
    sources: [{ url: uploadWiki }]
  }
}
const uploadFirst = resolveArtworkImageCandidates(preferUpload, 'thumb')
assert.ok(uploadFirst[0].includes('upload.wikimedia.org'))

console.log('imageResolver tests passed')
