-- Publication status on public.artworks (globe reads approved rows only).
alter table public.artworks add column if not exists status text not null default 'approved';

alter table public.artworks drop constraint if exists artworks_status_check;
alter table public.artworks
  add constraint artworks_status_check check (status in ('pending', 'approved', 'rejected'));

create index if not exists idx_artworks_status on public.artworks (status);

comment on column public.artworks.status is 'Globe loader filters status=approved. Ingested rows default approved; user submissions enter via user_artwork_submissions until approved.';
