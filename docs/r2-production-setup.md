# Cloudflare R2 setup for Art Globe production

Artwork binaries (~700 MB+) cannot live on Vercel’s deploy output. Host them on **Cloudflare R2** and bake public URLs into `externalArtData.json` / `artData.js` / runtime chunks.

## 1. Create an R2 bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → **Create bucket**.
2. Choose a name (e.g. `art-globe-images`). Note your **Account ID** (R2 overview page).

## 2. API token (S3-compatible)

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permissions: **Object Read & Write** on the bucket (or account).
3. Save **Access Key ID** and **Secret Access Key** (shown once).

## 3. Public URL for browsers

R2 buckets are private by default. Pick one:

**A) R2.dev subdomain (quickest)**  
Bucket → **Settings** → **Public access** → enable **R2.dev subdomain** and allow public access. You get a base URL like `https://pub-xxxxx.r2.dev`.

**B) Custom domain**  
Attach a domain under **Custom Domains** for the bucket and use that as `R2_PUBLIC_BASE_URL`.

## 4. Local `.env` (never commit secrets)

```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=art-globe-images
R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev
# Optional: prefix all object keys (must match rewrite script)
# R2_KEY_PREFIX=art-globe
```

## 5. Upload and rewrite (from `art-globe/`)

```bash
npm run upload:artworks:r2
npm run data:rewrite-cdn-urls
npm run data:runtime
npm run build
npm run build:strip-local-artwork-binaries
```

## 6. Vercel

- Set **no** R2 secrets in the browser: image URLs are already full `https://...` in JSON.
- Optional: `VITE_DATA_SOURCE=static` (default).

See [README.md](../README.md) production section for the full pipeline.
