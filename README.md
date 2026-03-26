# Art Globe

An interactive 3D “art atlas” that places artworks as clickable markers on a globe.
When you hover markers you get quick context; when you click a marker you open a side panel with artwork details.

This repo is MIT-licensed so others can improve it.

## Live demo

To be uploaded

## Tech

- React + Vite
- `react-globe.gl` (WebGL globe)
- Three.js (atmosphere / cloud / ambience visuals)

## Getting started

1. Install dependencies:
   - `npm install`
2. Run dev server:
   - `npm run dev`

Open the app at `http://localhost:5173`.

## Artwork images

To keep the public repo lightweight, downloaded marker images (`public/artworks/**`) are excluded from version control.
When images are missing, the app falls back to local placeholders until you seed/localize images locally.

Useful scripts:

- `npm run fetch:artworks` (seed dataset + download images locally)
- `npm run localize:asia` (download/rewrite East Asia thumbnails locally)
- `npm run check:data` (content-quality checker)

## License

MIT. See `LICENSE`.
