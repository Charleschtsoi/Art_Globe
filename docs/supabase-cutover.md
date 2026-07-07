# Supabase Cutover Checklist

## Environment variables

Pipeline (Node scripts):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- **Archive-6 images:** prefer **Cloudflare R2** (free tier ~10GB): set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` (public URL base, no trailing slash). If all are set, `npm run kaggle6:upload` uses R2. Otherwise use Supabase Storage with `SUPABASE_STORAGE_BUCKET=art-images` (optional override).
- Optional `KAGGLE6_IMAGE_STORAGE=r2` or `supabase` to force backend when both are configured.

App runtime (Vite):

- `VITE_DATA_SOURCE=supabase`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_TABLE=artworks` (optional)

## SQL bootstrap

Run:

- `supabase/schema.sql`

If the SQL editor shows **Success. No rows returned**, that is expected: DDL does not return rows. Confirm success in **Table Editor** (`public.artworks`) and **Storage** (bucket `art-images`).

This creates:

- `public.artworks` table + indexes + update trigger
- RLS public select policy
- `art-images` storage bucket + public read policy

## Recommended rollout

1. Keep production on `VITE_DATA_SOURCE=static`.
2. Populate Supabase via:
   - `npm run kaggle6:import && npm run kaggle6:enrich && npm run kaggle6:validate && npm run kaggle6:upload && npm run kaggle6:upsert`
   - `npm run kaggle2:import && npm run kaggle2:enrich && npm run kaggle2:validate && npm run kaggle2:upsert`
3. Verify row counts and random image URLs.
4. Deploy preview with `VITE_DATA_SOURCE=supabase`.
5. Validate globe/search/filter behavior.
6. Switch production env to Supabase mode.

