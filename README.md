# 🌍 Art Globe

**See the world's art — on an actual globe.**

Art Globe is a free, open-source web app that places thousands of artworks on a beautiful 3D globe you can spin, zoom, and explore. Hover over a marker to get a quick preview. Click it to dive into the details. It's like Google Earth, but for paintings.

All artwork data comes from the [WikiArt dataset on Kaggle](https://www.kaggle.com/datasets/steubk/wikiart), and we use Wikipedia and Wikidata to figure out where each piece belongs on the map.

**[🚀 Try the Live Demo](https://art-globe-l1nm.vercel.app/)**

---

## What's Inside

- [What Can It Do?](#what-can-it-do)
- [What's Under the Hood?](#whats-under-the-hood)
- [Get Up and Running](#get-up-and-running)
- [Bringing in More Art (Data Pipelines)](#bringing-in-more-art-data-pipelines)
  - [WikiArt Pipeline](#wikiart-pipeline)
  - [Kaggle Archive-6 (Art with Pictures)](#kaggle-archive-6-art-with-pictures)
  - [Kaggle Archive-2 (Art Info Only)](#kaggle-archive-2-art-info-only)
  - [Want Even More Art?](#want-even-more-art)
- [Using Supabase for Bigger Datasets](#using-supabase-for-bigger-datasets)
  - [How to Set It Up](#how-to-set-it-up)
  - [Switching from Static Files to Supabase](#switching-from-static-files-to-supabase)
- [Going Live (Vercel + Cloudflare R2)](#going-live-vercel--cloudflare-r2)
- [Environment Variables](#environment-variables)
- [Community submissions (optional)](#community-submissions-optional)
- [Want to Help?](#want-to-help)
- [License](#license)

---

## What Can It Do?

- **Spin a 3D globe** complete with atmosphere, clouds, and soft lighting
- **Tap on artwork markers** to see hover previews and a detailed side panel
- **Works with zero backend** using pre-built data files — or connect to **Supabase** when your collection grows
- **Automated data tools** that pull artwork from Kaggle, find the right locations, check quality, and get everything globe-ready
- **CDN-friendly** — serve thousands of thumbnail images through Cloudflare R2 or any similar service

---

## What's Under the Hood?

| What                 | Tool                                                     |
| -------------------- | -------------------------------------------------------- |
| User interface       | React + Vite                                            |
| The globe itself     | `react-globe.gl` + Three.js                              |
| Data (simple mode)   | Pre-built JSON files in `public/data/`                   |
| Data (full mode)     | Supabase (Postgres database + file storage)               |
| Image hosting        | Cloudflare R2 (optional)                                 |
| Location lookups     | Wikipedia, Wikidata, and OpenStreetMap                   |

---

## Get Up and Running

You can have Art Globe running on your computer in under a minute:

```bash
# 1. Grab the code
git clone https://github.com/Charleschtsoi/Art_Globe.git
cd Art_Globe

# 2. Install what's needed
npm install

# 3. Fire it up
npm run dev
```

Head to [http://localhost:5173](http://localhost:5173) and you're in! The app comes with sample data already included — no accounts or API keys needed.

**Thumbnails in this repo:** The builtin Western artworks ship as small files under `public/artworks/_oss/`. The large merged dataset in `public/data/chunks/` points at **Wikimedia Commons** URLs for most rows (a deterministic painting per city for open-source demos — not always the exact work). If you regenerate data with `npm run data:runtime`, run `npm run data:oss-showcase` afterward to restore that behavior, or run pipelines + local images for full accuracy.

### Want to add more artwork?

```bash
npm run fetch:artworks       # Download artwork data and images
npm run localize:asia        # Grab East Asian thumbnails locally
npm run check:data           # Make sure everything looks good
npm run pipeline:counts      # See how much data you have
```

Heavy pipeline output (Kaggle, WikiArt, etc.) stays out of git by default. The `_oss` bundle and Commons URLs cover the default clone; missing files fall back to a simple placeholder where needed.

### A heads-up for Mac users

Some of the data steps can take a while. To stop your Mac from falling asleep mid-process, use this handy wrapper:

```bash
./scripts/run-without-sleep.sh npm run kaggle6:enrich
```

It uses macOS's built-in `caffeinate` tool. On other systems, it simply runs the command normally. Quick tasks like `validate` or `merge` don't need this.

---

## Bringing in More Art (Data Pipelines)

Art Globe includes tools that pull artwork data from Kaggle, look up where each piece was created, and get it ready for the globe. Along the way, files are saved to a `tmp/` folder, and the final result ends up in `src/data/externalArtData.json`.

### WikiArt Pipeline

The [WikiArt dataset](https://www.kaggle.com/datasets/steubk/wikiart) is about 34 GB when unpacked — so **don't try to commit it to git!** Check out [`docs/wikiart-ingestion.md`](docs/wikiart-ingestion.md) for details on file layout, disk space, and licensing.

Once you've downloaded the dataset and set your `WIKIART_ROOT` path:

```bash
npm run wikiart:import       # Find usable artworks → tmp/wikiart-candidates.json
npm run wikiart:enrich       # Look up locations    → tmp/wikiart-enriched.json
npm run wikiart:validate     # Quality checks       → tmp/wikiart-validated.json
npm run wikiart:upload       # Upload images        → tmp/wikiart-uploaded.json
npm run wikiart:merge        # Add to main dataset  → src/data/externalArtData.json
npm run data:runtime         # Rebuild globe data   → public/data/chunks + search index
```

> **⚠️ About licensing:** WikiArt data is often limited to non-commercial use. Please check the [dataset license](https://www.kaggle.com/datasets/steubk/wikiart) and [WikiArt's terms](https://www.wikiart.org/) before sharing anything publicly.

### Kaggle Archive-6 (Art with Pictures)

This archive includes actual image files, so you'll get real thumbnails on the globe.

```bash
# Set KAGGLE6_ROOT to your local archive-6 folder, then:
npm run kaggle6:import         # Find usable artworks
npm run kaggle6:enrich         # Look up locations
npm run kaggle6:validate       # Quality checks
npm run kaggle6:local-images   # Copy thumbnails into the app
npm run kaggle6:merge          # Add to main dataset
npm run data:runtime           # Rebuild globe data
```

If both a local file and an uploaded file exist, the merge step prefers local. To use cloud URLs instead, set `KAGGLE6_MERGE_INPUT=tmp/kaggle6-uploaded.json`.

### Kaggle Archive-2 (Art Info Only)

This archive has metadata but no images. By default, artworks get a placeholder thumbnail (`/artworks/external/external-unavailable.svg`). You can point to a different image using `KAGGLE2_PLACEHOLDER_IMAGE_URL`.

```bash
# Set KAGGLE2_ROOT to your local archive-2 folder, then:
npm run kaggle2:import
npm run kaggle2:enrich
npm run kaggle2:validate
npm run kaggle2:merge          # Tip: use KAGGLE2_MAX_MERGE_TOTAL to control how many get added
npm run data:runtime
```

### Want Even More Art?

The number of artworks on the globe grows when you merge more data and run `npm run data:runtime`. Here's a simple roadmap:

| Step       | Goal                               | What to Do                                                                           |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Start here | ~14k+ artworks with real images    | Run Archive-6: `local-images` → `merge` → `data:runtime`                             |
| Add more   | Include metadata-rich artworks     | Run Archive-2: `validate` → `merge` → `data:runtime`                                 |
| Go bigger  | Push toward 35k+ artworks          | Raise candidate limits, relax confidence settings, re-run everything                    |
| Scale up   | 35k+ or heavy traffic              | Switch to Supabase mode (see below)                                                   |

You can fine-tune each pipeline using environment variables. Here are the most useful ones:

**For Archive-6:**

| What You Want              | Setting to Change                  | Default |
| -------------------------- | ---------------------------------- | ------- |
| More artwork candidates    | `KAGGLE6_MAX_CANDIDATES`           | 15,000  |
| Cap artworks per artist    | `KAGGLE6_MAX_PER_ARTIST_IMPORT`    | —       |
| Accept fuzzier locations     | `KAGGLE6_MIN_LOCATION_CONFIDENCE`  | 0.68    |
| Accept lower quality scores | `KAGGLE6_MIN_OVERALL_CONFIDENCE`   | —       |
| More rows in final output   | `KAGGLE6_MAX_MERGE_TOTAL`          | —       |
| Allow larger image files    | `KAGGLE6_IMAGE_MAX_BYTES`          | —       |

**For Archive-2:**

| What You Want                 | Setting to Change                                                       |
| ----------------------------- | ----------------------------------------------------------------------- |
| More candidates               | `KAGGLE2_MAX_CANDIDATES`, `KAGGLE2_MAX_PER_ARTIST_IMPORT`               |
| Location & quality thresholds | `KAGGLE2_MIN_LOCATION_CONFIDENCE`, `KAGGLE2_MIN_OVERALL_CONFIDENCE`     |
| Final output size             | `KAGGLE2_MAX_MERGE_TOTAL`, `KAGGLE2_MAX_PER_ARTIST_MERGE`               |

Check your progress anytime with `npm run pipeline:counts` and `npm run check:data`.

---

## Using Supabase for Bigger Datasets

Once you're working with 35,000+ artworks, pre-built files start to feel sluggish. Supabase mode lets the app talk directly to a real database, which handles large datasets much more smoothly.

### How to Set It Up

```bash
# 1. Create the database tables
#    Run the SQL in supabase/schema.sql on your Supabase project

# 2. Add your credentials to .env (see .env.example):
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET
#    Optional for image hosting:
#    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
#    R2_BUCKET_NAME, R2_PUBLIC_BASE_URL

# 3. Load Archive-6 (art with images)
npm run kaggle6:import
npm run kaggle6:enrich
npm run kaggle6:validate
npm run kaggle6:upload       # Sends images to R2 or Supabase Storage
npm run kaggle6:upsert       # Saves artwork info to the database

# 4. Load Archive-2 (metadata only)
npm run kaggle2:import
npm run kaggle2:enrich
npm run kaggle2:validate
npm run kaggle2:upsert

# 5. Tell the app to use Supabase
#    Set VITE_DATA_SOURCE=supabase
#    Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

### Switching from Static Files to Supabase

Here's the short version:

1. Run the SQL in `supabase/schema.sql` on your Supabase project.
2. Add your server credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, storage bucket, and optionally R2 keys).
3. Run the pipelines through `upload` → `upsert`.
4. Set the browser-side variables: `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Changed your mind? Just unset `VITE_DATA_SOURCE` or set it back to `static`.

---

## Going Live (Vercel + Cloudflare R2)

When you build the app for production, all the artwork images in `public/artworks/` get copied into the final build — and that can easily top 1 GB. Vercel isn't built to host that many images, so we recommend serving them from Cloudflare R2 (or any similar CDN) instead.

> **⚠️ Heads up:** Image files aren't included in git, and the production build automatically removes them from the output folder. Until you complete the steps below, thumbnails will show as broken images in production.

```bash
# 1. Set up your R2 bucket and public URL
#    See docs/r2-production-setup.md for the full walkthrough

# 2. Upload your images to R2
npm run upload:artworks:r2

# 3. Update data files to point to the CDN
npm run data:rewrite-cdn-urls

# 4. Rebuild the globe data with the new URLs
npm run data:runtime

# 5. Create the production build
npm run build:production
```

This is already configured as the default build command in [`vercel.json`](vercel.json). If your Git repository includes this app in a subfolder (not at the repo root), set the Vercel **Root Directory** to that folder — for example `art-globe` in a monorepo. No R2 secrets are needed on Vercel — the CDN URLs are baked into the data files at build time.

> **💡 Tip:** Don't run `data:rewrite-cdn-urls` on your main branch if you still want images to work locally. Use a separate `production` branch, or restore the original paths from git after rewriting.

---

## Environment Variables

Every setting you can tweak is documented in [`.env.example`](.env.example). You'll find options for pipeline tuning, Supabase credentials, Cloudflare R2 configuration, and browser-side feature flags.

---

## Community submissions (optional)

The app can accept community artwork submissions (with moderation) through Supabase. For social providers, Edge Functions, and the Nominatim proxy used when geocoding submissions, see [`docs/auth-social-setup.md`](docs/auth-social-setup.md).

---

## Want to Help?

We'd love your help! Whether you want to fix a bug, improve the data pipeline, add a new data source, or make the globe even cooler — just open an issue or send a pull request. All contributions are welcome.

---

## License

This project is open-source under the **[MIT License](LICENSE)**.

You're free to share, fork, change, and use this code however you like. Just keep the attribution if you build something with it.

### A note about money

This project is a passion project — it's non-commercial and built for the joy of it. The goal is to create a community-driven 3D art globe, not to turn a profit. If you fork this and make something cool, I'd love to hear about it!

---

<p align="center">
  Made with 🎨 and ☕
</p>
