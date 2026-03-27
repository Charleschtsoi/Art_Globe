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

## WikiArt (Kaggle) pipeline

The [WikiArt dataset on Kaggle](https://www.kaggle.com/datasets/steubk/wikiart) is large (~34GB unpacked). Do **not** commit the raw archive. See [docs/wikiart-ingestion.md](docs/wikiart-ingestion.md) for layout, disk space, and license notes.

After downloading and setting `WIKIART_ROOT`:

1. `npm run wikiart:import` → `tmp/wikiart-candidates.json`
2. `npm run wikiart:enrich` → `tmp/wikiart-enriched.json` (Wikipedia/Wikidata; rate-limited)
3. `npm run wikiart:validate` → `tmp/wikiart-validated.json`
4. `npm run wikiart:upload` → `tmp/wikiart-uploaded.json` (local `public/artworks/wikiart/` or Cloudinary if configured)
5. `npm run wikiart:merge` → appends to `src/data/externalArtData.json`
6. `npm run data:runtime` → refreshes `public/data/chunks` and search index

WikiArt-derived data is often **non-commercial**; verify the dataset and [WikiArt](https://www.wikiart.org/) terms for your project before publishing.

## License

MIT. See `LICENSE`.
