-- User artwork submissions, profiles (admin flag), private upload bucket + RLS.
-- Apply in Supabase SQL Editor or via supabase db push.
-- After apply: create bucket in Dashboard if insert fails (or use Storage UI).

create extension if not exists pgcrypto;

-- Optional description on published artworks (user submissions).
alter table public.artworks add column if not exists description text default '';

alter table public.artworks add column if not exists submission_id uuid;

create index if not exists idx_artworks_submission_id on public.artworks (submission_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- No client UPDATE on profiles; set is_admin / display_name in SQL or dashboard if needed.

create table if not exists public.user_artwork_submissions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  title text not null,
  artist text not null,
  museum_name text not null,
  city text not null,
  country text default '',
  lat double precision not null,
  lng double precision not null,
  time_period text default 'modern',
  year_text text default '',
  medium text default '',
  description text default '',
  image_storage_path text not null,
  reviewer_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_submissions_status_created on public.user_artwork_submissions (status, created_at desc);
create index if not exists idx_submissions_user on public.user_artwork_submissions (user_id);

drop trigger if exists trg_submissions_updated_at on public.user_artwork_submissions;
create trigger trg_submissions_updated_at
before update on public.user_artwork_submissions
for each row execute function public.set_updated_at();

alter table public.user_artwork_submissions enable row level security;

drop policy if exists submissions_insert_own on public.user_artwork_submissions;
create policy submissions_insert_own
on public.user_artwork_submissions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists submissions_select_own_or_admin on public.user_artwork_submissions;
create policy submissions_select_own_or_admin
on public.user_artwork_submissions
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- No client UPDATE on submissions; use RPC / Edge Function.

create or replace function public.is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.reject_user_submission (p_submission_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n_rows int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.user_artwork_submissions
  set
    status = 'rejected',
    reviewer_note = coalesce(p_note, ''),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_submission_id
    and status = 'pending';
  get diagnostics n_rows = row_count;
  if n_rows = 0 then
    raise exception 'submission not found or not pending';
  end if;
end;
$$;

revoke all on function public.reject_user_submission (uuid, text) from public;
grant execute on function public.reject_user_submission (uuid, text) to authenticated;

-- Auto-create profile on signup
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(new.email, '@', 1),
      'User'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Private bucket for pending uploads
insert into storage.buckets (id, name, public)
values ('submission-uploads', 'submission-uploads', false)
on conflict (id) do update set public = false;

drop policy if exists submission_uploads_insert_own on storage.objects;
create policy submission_uploads_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'submission-uploads'
  and (storage.foldername(name))[1] = 'submissions'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists submission_uploads_select_own_or_admin on storage.objects;
create policy submission_uploads_select_own_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'submission-uploads'
  and (
    (
      (storage.foldername(name))[1] = 'submissions'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
);

drop policy if exists submission_uploads_delete_own on storage.objects;
create policy submission_uploads_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'submission-uploads'
  and (storage.foldername(name))[1] = 'submissions'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Service role (Edge Functions) bypasses RLS for cross-bucket copy.

comment on table public.user_artwork_submissions is 'Pending user uploads; approve via Edge Function approve-submission.';
comment on table public.profiles is 'Set is_admin = true in SQL for moderator users.';

alter table public.artworks
  drop constraint if exists fk_artworks_submission;

alter table public.artworks
  add constraint fk_artworks_submission
  foreign key (submission_id) references public.user_artwork_submissions (id) on delete set null;
