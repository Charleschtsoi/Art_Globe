# Social login, submissions, and moderation

This app can accept user-submitted artworks via Supabase Auth (OAuth), private Storage uploads, and a moderation queue. Approved pieces are copied to the public `art-images` bucket and inserted into `public.artworks`.

## 1. Database and storage

Apply the migration under `supabase/migrations/` (SQL Editor or `supabase db push`) so you have:

- `public.profiles` (with `is_admin`)
- `public.user_artwork_submissions`
- Storage bucket `submission-uploads` (private) with folder policies under `submissions/{user_id}/…`
- Optional columns on `public.artworks`: `description`, `submission_id`

Mark your user as an admin (replace the UUID with your `auth.users.id`):

```sql
update public.profiles set is_admin = true where id = '<your-user-uuid>';
```

## 2. Supabase Auth (Google / GitHub)

1. In [Authentication → Providers](https://supabase.com/dashboard), enable **Google** and/or **GitHub** and add each provider’s client ID and secret.
2. Under **Authentication → URL configuration**:
   - **Site URL**: production origin, e.g. `https://art-globe-l1nm.vercel.app`
   - **Redirect URLs**: include  
     `http://localhost:5173/**`  
     `https://<your-production-host>/**`  
     (Vite default dev port is `5173`; add others if you use a different port.)

The submit flow redirects back to `/submit` (and moderation to `/moderate`) after OAuth.

## 3. Edge Function `approve-submission`

Deploy from the `art-globe` project (with Supabase CLI linked to the project):

```bash
supabase functions deploy approve-submission
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically in hosted Edge Functions. The function validates the caller’s JWT, checks `profiles.is_admin`, copies the file from `submission-uploads` to `art-images`, inserts a row into `artworks`, and sets the submission to `approved`.

Rejections use the database RPC `reject_user_submission` (no Edge Function).

## 4. Frontend environment

Copy `.env.example` to `.env` and set at least:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Submission and moderation routes are shown only when these are set.

### Showing approved user art on the globe

Bulk dataset builds use **static** chunks under `public/data/`. User submissions approved into `artworks` are **not** in those chunks.

To include them in the live globe, run the app with:

```bash
VITE_DATA_SOURCE=supabase
```

so `App` loads artworks via `supabaseLoader` from the `artworks` table (ingested rows plus `source = 'user_submission'`).

**Hybrid (later):** you can keep `VITE_DATA_SOURCE=static` for the main corpus and add a separate small fetch of approved rows; that path is not implemented in this repo—using **Supabase mode** for production is the supported way to merge UGC with the same loader.

## 5. Vercel / production

- Set the same `VITE_*` variables in the hosting dashboard.
- Set **Supabase** Site URL and redirect URLs to your production domain.
- After deploy, smoke-test: `/submit` → OAuth → upload → pending row; `/moderate` as admin → approve → confirm new marker when `VITE_DATA_SOURCE=supabase`.
