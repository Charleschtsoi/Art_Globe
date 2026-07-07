-- Pending rows in public.artworks (direct submit), stricter SELECT RLS, anon INSERT, moderation fields.

alter table public.artworks add column if not exists pending_storage_path text;

alter table public.artworks add column if not exists reviewer_note text;
alter table public.artworks add column if not exists reviewed_at timestamptz;
alter table public.artworks add column if not exists reviewed_by uuid references auth.users (id);

comment on column public.artworks.pending_storage_path is 'Private submission-uploads path while status=pending; cleared when approved.';

drop policy if exists artworks_select_public on public.artworks;

create policy artworks_select_approved_or_admin
on public.artworks
for select
to anon, authenticated
using (
  status = 'approved'
  or public.is_admin()
);

drop policy if exists artworks_insert_pending on public.artworks;
create policy artworks_insert_pending
on public.artworks
for insert
to anon, authenticated
with check (
  status = 'pending'
  and source = 'user_submission'
  and pending_storage_path is not null
  and length(trim(pending_storage_path)) > 0
);

create or replace function public.reject_pending_artwork (p_artwork_id uuid, p_note text)
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
  update public.artworks
  set
    status = 'rejected',
    reviewer_note = coalesce(p_note, ''),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_artwork_id
    and status = 'pending';
  get diagnostics n_rows = row_count;
  if n_rows = 0 then
    raise exception 'artwork not found or not pending';
  end if;
end;
$$;

revoke all on function public.reject_pending_artwork (uuid, text) from public;
grant execute on function public.reject_pending_artwork (uuid, text) to authenticated;
