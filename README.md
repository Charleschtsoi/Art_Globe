# Art Globe

An interactive 3D “art atlas” that places artworks as clickable markers on a globe.
When you hover markers you get quick context; when you click a marker you open a side panel with artwork details.

This repo is MIT-licensed so others can improve it.

## Live demo

Production: [art-globe-l1nm.vercel.app](https://art-globe-l1nm.vercel.app/) (configure **R2 + CDN URLs** before shipping large `public/artworks` — see [Production deployment](#production-deployment-vercel--cloudflare-r2)).

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

### Long-running pipelines on macOS

Data **import**, **enrich**, **upload**, and **upsert** steps can run for a long time. To **prevent your Mac from sleeping** while a command runs, use one of these from the `art-globe/` directory:

- **Repo helper** (uses `caffeinate -i` on macOS; no-op elsewhere):

  `./scripts/run-without-sleep.sh npm run kaggle2:enrich`

- **Built-in macOS**: `caffeinate -i -- npm run kaggle6:import`

Wrap **import** and **enrich** (and **upload** / network-heavy steps) in particular; short steps like **validate** or **merge** are optional to wrap.

## Artwork images

To keep the public repo lightweight, downloaded marker images (`public/artworks/**`) are excluded from version control.
When images are missing, the app falls back to local placeholders until you seed/localize images locally.

Useful scripts:

- `npm run fetch:artworks` (seed dataset + download images locally)
- `npm run localize:asia` (download/rewrite East Asia thumbnails locally)
- `npm run check:data` (content-quality checker)
- `npm run pipeline:counts` (tmp Kaggle outputs + manifest `totalRecords` — useful when scaling imports)

## WikiArt (Kaggle) pipeline

The [WikiArt dataset on Kaggle](https://www.kaggle.com/datasets/steubk/wikiart) is large (~34GB unpacked). Do **not** commit the raw archive. See [docs/wikiart-ingestion.md](docs/wikiart-ingestion.md) for layout, disk space, and license notes.

After downloading and setting `WIKIART_ROOT` (on macOS, prefix long steps with `./scripts/run-without-sleep.sh` — see [Long-running pipelines on macOS](#long-running-pipelines-on-macos)):

1. `npm run wikiart:import` → `tmp/wikiart-candidates.json`
2. `npm run wikiart:enrich` → `tmp/wikiart-enriched.json` (Wikipedia/Wikidata; rate-limited)
3. `npm run wikiart:validate` → `tmp/wikiart-validated.json`
4. `npm run wikiart:upload` → `tmp/wikiart-uploaded.json` (local `public/artworks/wikiart/` or Cloudinary if configured)
5. `npm run wikiart:merge` → appends to `src/data/externalArtData.json`
6. `npm run data:runtime` → refreshes `public/data/chunks` and search index

WikiArt-derived data is often **non-commercial**; verify the dataset and [WikiArt](https://www.wikiart.org/) terms for your project before publishing.

## Localhost static + Kaggle (no Supabase)

The default app mode loads chunked JSON from `public/data/` (see `VITE_DATA_SOURCE=static`). You can feed it from the archive-6 Kaggle pipeline **without** cloud storage or Supabase. On **macOS**, wrap long steps with `./scripts/run-without-sleep.sh` (see [Long-running pipelines on macOS](#long-running-pipelines-on-macos)).

1. Point **`KAGGLE6_ROOT`** at your local archive-6 folder (same layout as the existing Kaggle section below).
2. Run **`./scripts/run-without-sleep.sh npm run kaggle6:import`** → **`./scripts/run-without-sleep.sh npm run kaggle6:enrich`** → **`npm run kaggle6:validate`** → `tmp/kaggle6-validated.json`.
3. Copy images into the dev server’s public folder and build merge input:
   - **`./scripts/run-without-sleep.sh npm run kaggle6:local-images`** (or plain **`npm run`** if quick) → copies thumbnails to `public/artworks/kaggle6/` and writes **`tmp/kaggle6-local-for-merge.json`**.
   - **`npm run kaggle6:merge`** → appends rows to **`src/data/externalArtData.json`**. If both **`tmp/kaggle6-local-for-merge.json`** and **`tmp/kaggle6-uploaded.json`** exist, merge **uses the local file** first; set **`KAGGLE6_MERGE_INPUT=tmp/kaggle6-uploaded.json`** to force the cloud upload output.
4. **`npm run data:runtime`** → regenerates **`public/data/chunks`** and **`public/data/search-index.json`**.
5. Keep **`VITE_DATA_SOURCE=static`** (default), then **`npm run dev`**.

Optional merge limits: **`KAGGLE6_MAX_MERGE_TOTAL`**, **`KAGGLE6_MAX_PER_ARTIST_MERGE`**. Report: **`scripts/reports/kaggle6-merge-report.json`**.

### Archive-2 (metadata-only) for static localhost

Archive-2 has **no image files** in the import/enrich pipeline; merge assigns a **placeholder** thumbnail (`/artworks/external/external-unavailable.svg` by default) so rows pass normalization. Override with **`KAGGLE2_PLACEHOLDER_IMAGE_URL`** if needed.

1. Point **`KAGGLE2_ROOT`** at your local archive-2 folder (`artists.csv`, `artworks.csv`).
2. **`./scripts/run-without-sleep.sh npm run kaggle2:import`** → **`./scripts/run-without-sleep.sh npm run kaggle2:enrich`** → **`npm run kaggle2:validate`** → `tmp/kaggle2-validated.json` (macOS: use the wrapper on import/enrich — see [Long-running pipelines on macOS](#long-running-pipelines-on-macos)).
3. **`npm run kaggle2:merge`** → appends to **`src/data/externalArtData.json`** (optional: **`KAGGLE2_MERGE_INPUT`**, **`KAGGLE2_MAX_MERGE_TOTAL`**, **`KAGGLE2_MAX_PER_ARTIST_MERGE`**).
4. **`npm run data:runtime`**, then **`npm run dev`** with **`VITE_DATA_SOURCE=static`**.

Report: **`scripts/reports/kaggle2-merge-report.json`**.

### Scaling Kaggle imports (more art on the static globe)

`public/data/chunks/manifest.json` **`totalRecords`** grows only when more rows reach **`externalArtData.json`** via merge, then **`npm run data:runtime`**. Tune env vars (see [`.env.example`](.env.example)), re-run the pipeline steps, merge, and rebuild.

**Archive-6**

| Goal | Variables (defaults in scripts) |
|------|----------------------------------|
| More candidates | `KAGGLE6_MAX_CANDIDATES` (full default 15000; avoid `KAGGLE6_SMOKE=1` for full runs) |
| Per artist at import | `KAGGLE6_MAX_PER_ARTIST_IMPORT` |
| Looser location in enrich | `KAGGLE6_MIN_LOCATION_CONFIDENCE` (default 0.68) |
| Looser validation | `KAGGLE6_MIN_OVERALL_CONFIDENCE`, `KAGGLE6_MAX_PER_CITY` |
| Large images in upload | `KAGGLE6_IMAGE_MAX_BYTES` |
| More rows in merge | `KAGGLE6_MAX_MERGE_TOTAL`, `KAGGLE6_MAX_PER_ARTIST_MERGE` |

Upload only processes rows with **`localImagePath`**; use **`kaggle6:local-images`** if not using cloud storage.

**Archive-2**

| Goal | Variables |
|------|-----------|
| More candidates | `KAGGLE2_MAX_CANDIDATES`, `KAGGLE2_MAX_PER_ARTIST_IMPORT` |
| Enrich / validate | `KAGGLE2_MIN_LOCATION_CONFIDENCE`, `KAGGLE2_MIN_OVERALL_CONFIDENCE`, `KAGGLE2_MAX_PER_CITY` |
| Merge | `KAGGLE2_MAX_MERGE_TOTAL`, `KAGGLE2_MAX_PER_ARTIST_MERGE` |

**Verify counts:** `npm run pipeline:counts` — prints `tmp/*` sizes, last merge **`importedCount`**, and **`manifest.json`** **`totalRecords`**. Optionally **`npm run check:data`**.

**Very large datasets (tens of thousands+ rows):** static chunks and repo size can become heavy. Consider **`VITE_DATA_SOURCE=supabase`** after **`kaggle6:upsert`** / **`kaggle2:upsert`** (see below) so the browser loads from the database instead of shipping all chunks in `public/data/`.

### Inventory growth tiers (baseline → scale-up)

Use this order when growing **`manifest.json`** **`totalRecords`** from Kaggle without new code:

| Tier | Goal | Actions |
|------|------|---------|
| **1 — Unlock validated Kaggle6** | Jump to ~14k+ rows with real thumbnails | `npm run kaggle6:local-images` (resize/compress via **Sharp**; see **`KAGGLE6_LOCAL_*`** in [`.env.example`](.env.example)) → **`npm run kaggle6:merge`** → **`npm run data:runtime`**. Merge **prefers** `tmp/kaggle6-local-for-merge.json` over `tmp/kaggle6-uploaded.json` when both exist; for cloud-only merge set **`KAGGLE6_MERGE_INPUT`**. |
| **2 — Re-validate Kaggle2** | Add metadata-heavy rows (placeholders) | After enrich, **`npm run kaggle2:validate`** → **`npm run kaggle2:merge`** (default cap **`KAGGLE2_MAX_MERGE_TOTAL=3000`**) → **`npm run data:runtime`**. |
| **3 — More raw candidates** | Push toward 35k+ rows | Raise **`KAGGLE6_MAX_CANDIDATES`** / **`KAGGLE2_MAX_CANDIDATES`**, relax **`KAGGLE6_MIN_LOCATION_CONFIDENCE`** / validation caps carefully, re-run **import → enrich → validate → local-images or upload → merge → data:runtime**. Expect long Wikimedia API runs; use **`./scripts/run-without-sleep.sh`** on macOS. |
| **4 — Backend mode** | 35k+ or heavy hosting | **`VITE_DATA_SOURCE=supabase`**, **`kaggle6:upsert`** / **`kaggle2:upsert`**, optional R2 for images — see [Migrating static runtime to Supabase](#migrating-static-runtime-to-supabase) and [Kaggle -> Supabase pipeline](#kaggle---supabase-pipeline). |

## Kaggle -> Supabase pipeline

This repo now includes a Supabase-oriented pipeline for large local Kaggle sources (`kaggle sources/archive-*`).

### 1) Prepare Supabase

- Run SQL in `supabase/schema.sql`
- Create env vars locally:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Optional: **Cloudflare R2** for archive-6 images (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`) — see `.env.example`. If all are set, `kaggle6:upload` uses R2; otherwise Supabase Storage.
  - `SUPABASE_STORAGE_BUCKET` (default `art-images`, used when not using R2)

### 2) Process archive-6 (images + metadata)

On **macOS**, prefix long steps with `./scripts/run-without-sleep.sh` (see [Long-running pipelines on macOS](#long-running-pipelines-on-macos)).

1. `npm run kaggle6:import` -> `tmp/kaggle6-candidates.json`
2. `npm run kaggle6:enrich` -> `tmp/kaggle6-enriched.json`
3. `npm run kaggle6:validate` -> `tmp/kaggle6-validated.json`
4. `npm run kaggle6:upload` -> `tmp/kaggle6-uploaded.json` (uploads to **Cloudflare R2** if `R2_*` env is set, else Supabase Storage)
5. `npm run kaggle6:upsert` -> upserts metadata into Supabase `artworks`

### 3) Process archive-2 (metadata-only)

Same macOS note as above for import/enrich.

1. `npm run kaggle2:import` -> `tmp/kaggle2-candidates.json`
2. `npm run kaggle2:enrich` -> `tmp/kaggle2-enriched.json`
3. `npm run kaggle2:validate` -> `tmp/kaggle2-validated.json`
4. `npm run kaggle2:upsert` -> upserts validated rows to Supabase

### 4) Run app with Supabase mode

Set:

- `VITE_DATA_SOURCE=supabase`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- optional `VITE_SUPABASE_TABLE` (`artworks` default)

When unset, app falls back to current static runtime chunk mode.

### Migrating static runtime to Supabase

Use this when **`public/data/chunks`** or **`public/artworks`** become too large for your host, or you want the browser to query Postgres instead of loading many chunk files.

1. **Schema:** apply `supabase/schema.sql` to your Supabase project.
2. **Secrets (server-side):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, storage bucket **`SUPABASE_STORAGE_BUCKET`**, and optionally **Cloudflare R2** (`R2_*`, `R2_PUBLIC_BASE_URL`) for archive-6 images — see [`.env.example`](.env.example).
3. **Load data:** run the Kaggle pipelines through **`kaggle6:upload`** (or static **`kaggle6:local-images`** if images stay in `public/`) then **`kaggle6:upsert`**; same for archive-2 with **`kaggle2:upsert`**.
4. **Browser env:** set **`VITE_DATA_SOURCE=supabase`**, **`VITE_SUPABASE_URL`**, **`VITE_SUPABASE_ANON_KEY`**, optional **`VITE_SUPABASE_TABLE`** (default `artworks`).
5. **Rollback:** unset **`VITE_DATA_SOURCE`** or set **`static`** to use **`npm run data:runtime`** output again.

## Production deployment (Vercel + Cloudflare R2)

Full `npm run build` copies **`public/artworks/**`** into **`dist/`** (~1 GB+ with Kaggle thumbnails). Vercel’s deploy and git are not suited to hosting hundreds of MB of raster images. **Host images on Cloudflare R2** (or any S3-compatible CDN) and store **absolute `https://...` URLs** in data.

**Important:** Raster files are **gitignored**, and **`build:production`** removes them from `dist/` after the Vite build. Until you run **`upload:artworks:r2`** and **`data:rewrite-cdn-urls`** (then **`data:runtime`**), production will reference **`/artworks/...`** paths that are **not** on the CDN — thumbnails will **404**. Complete steps 1–4 below before expecting images on [the live site](https://art-globe-l1nm.vercel.app/).

1. **R2 bucket + public URL:** follow **[docs/r2-production-setup.md](docs/r2-production-setup.md)** (`R2_ACCOUNT_ID`, keys, `R2_BUCKET_NAME`, **`R2_PUBLIC_BASE_URL`**).
2. **Upload binaries** from `art-globe/` (requires network; long runs: `./scripts/run-without-sleep.sh`):

   `npm run upload:artworks:r2`

3. **Rewrite** `/artworks/...` paths in **`src/data/externalArtData.json`** and **`src/artData.js`**:

   `npm run data:rewrite-cdn-urls`

4. **Regenerate chunks** (search index + chunk JSON pick up CDN URLs):

   `npm run data:runtime`

5. **Production build** (Vite + strip rasters from `dist/artworks` so the deploy stays ~tens of MB):

   `npm run build:production`

   This is the default **`buildCommand`** in [`vercel.json`](vercel.json). **`[.vercelignore](.vercelignore)`** avoids uploading local rasters if they exist in the build context.

6. **Vercel:** set project **Root Directory** to `art-globe` if the repo root is the monorepo. Browser env: **`VITE_DATA_SOURCE=static`** (default). No R2 secrets are needed in Vercel env — URLs are baked into JSON at build time.

Local dev with **relative** `/artworks/` paths: do not run **`data:rewrite-cdn-urls`** on your main branch if you need offline images; use a **`production`** git branch or re-clone after rewrite, or restore from git.

## License

MIT. See `LICENSE`.
