-- Art Globe Supabase schema
-- Run in Supabase SQL editor.
--
-- Expected result: "Success. No rows returned" — that is normal for DDL
-- (CREATE TABLE, triggers, policies). Use Table Editor to confirm `artworks`,
-- and Storage to confirm bucket `art-images`.

create extension if not exists pgcrypto;

create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  title text not null,
  artist text not null,
  museum_name text not null,
  city text not null,
  country text default '',
  lat double precision not null,
  lng double precision not null,
  time_period text default 'modern',
  source text not null,
  medium text default '',
  year_text text default '',
  image_url text default '',
  canonical_fingerprint text unique not null,
  confidence double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_artworks_lat_lng on public.artworks (lat, lng);
create index if not exists idx_artworks_time_period on public.artworks (time_period);
create index if not exists idx_artworks_source on public.artworks (source);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_artworks_updated_at on public.artworks;
create trigger trg_artworks_updated_at
before update on public.artworks
for each row execute function public.set_updated_at();

alter table public.artworks enable row level security;

drop policy if exists artworks_select_public on public.artworks;
create policy artworks_select_public
on public.artworks
for select
to anon, authenticated
using (true);

-- Storage bucket bootstrap (run in SQL editor).
insert into storage.buckets (id, name, public)
values ('art-images', 'art-images', true)
on conflict (id) do update set public = true;

-- Public read policy for art-images bucket.
drop policy if exists art_images_public_read on storage.objects;
create policy art_images_public_read
on storage.objects
for select
to public
using (bucket_id = 'art-images');

