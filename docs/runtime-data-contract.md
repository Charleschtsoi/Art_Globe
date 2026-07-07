# Runtime Data Contract

The globe runtime data is generated into `public/data` and consumed at runtime (not bundled into app JS).

## Chunk manifest

Path: `public/data/chunks/manifest.json`

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "chunkSize": 300,
  "totalRecords": 12345,
  "totalChunks": 44,
  "chunks": [
    {
      "id": "asia-0000",
      "region": "asia",
      "path": "/data/chunks/asia-0000.json",
      "count": 300,
      "minLat": -12,
      "maxLat": 60,
      "minLng": 25,
      "maxLng": 170,
      "sampleCities": ["Tokyo", "Seoul"]
    }
  ]
}
```

## Chunk payload

Path: `public/data/chunks/<chunkId>.json`

```json
{
  "chunkId": "asia-0000",
  "region": "asia",
  "records": [/* normalized artwork records */]
}
```

## Search index

Path: `public/data/search-index.json`

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "totalRecords": 12345,
  "records": [
    {
      "id": "artwork-id",
      "chunkId": "asia-0000",
      "title": "Artwork title",
      "artist": "Artist",
      "museum": "Museum name",
      "city": "City",
      "country": "Country",
      "lat": 35.67,
      "lng": 139.65,
      "imageUrl": "https://...",
      "canonicalImageUrl": "https://...",
      "assets": {
        "thumbnail_url": "https://...",
        "high_res_url": "https://...",
        "sources": [
          { "provider": "wikimedia", "url": "https://...", "role": "primary" }
        ],
        "availability": "ok",
        "checkedAt": "ISO-8601"
      }
    }
  ]
}
```

## Build step

Run `npm run data:probe-images` to validate external image URLs (writes `public/data/image-availability.json`), then `npm run data:runtime` whenever source datasets change.
