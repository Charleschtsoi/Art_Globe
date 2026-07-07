import assert from 'node:assert/strict'
import {
  buildLocationQueue,
  indexInPresentationQueue,
  locationKey
} from '../src/lib/presentationQueue.js'

const artworkById = new Map([
  ['1', { id: '1', title: 'Alpha', museumName: 'Louvre', displayCity: 'Paris', lat: 48.86, lng: 2.33 }],
  ['2', { id: '2', title: 'Beta', museumName: 'Louvre', displayCity: 'Paris', lat: 48.86, lng: 2.33 }],
  ['3', { id: '3', title: 'Gamma', museumName: 'Other', displayCity: 'Paris', lat: 48.86, lng: 2.33 }]
])

assert.equal(locationKey(artworkById.get('1')), 'museum:Louvre|Paris')

const clusterMarker = {
  isCluster: true,
  clusterItems: [{ id: '1' }, { id: '3' }]
}
const clusterQueue = buildLocationQueue(
  clusterMarker,
  null,
  artworkById,
  [...artworkById.values()],
  artworkById.get('1')
)
assert.deepEqual(
  clusterQueue.map((a) => a.id),
  ['1', '3']
)

const preserved = [artworkById.get('1'), artworkById.get('2')]
const preservedQueue = buildLocationQueue(
  { id: '2' },
  null,
  artworkById,
  [...artworkById.values()],
  artworkById.get('2'),
  preserved
)
assert.deepEqual(
  preservedQueue.map((a) => a.id),
  ['1', '2']
)

const museumStack = {
  isMuseumStack: true,
  artworks: [artworkById.get('1'), artworkById.get('2')]
}
const museumQueue = buildLocationQueue(
  museumStack,
  museumStack,
  artworkById,
  [...artworkById.values()],
  artworkById.get('2')
)
assert.deepEqual(
  museumQueue.map((a) => a.id),
  ['1', '2']
)

const siblings = buildLocationQueue(
  { id: '1' },
  artworkById.get('1'),
  artworkById,
  [...artworkById.values()],
  artworkById.get('1')
)
assert.deepEqual(
  siblings.map((a) => a.id),
  ['1', '2']
)

assert.equal(indexInPresentationQueue(siblings, artworkById.get('2')), 1)

console.log('presentationQueue tests passed')
