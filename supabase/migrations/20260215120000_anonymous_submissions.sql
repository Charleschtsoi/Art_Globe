-- Anonymous / low-friction submissions: nullable user_id, anon INSERT RLS, storage under submissions/anonymous/

alter table public.user_artwork_submissions alter column user_id drop not null;

alter table public.user_artwork_submissions
  drop constraint if exists user_artwork_submissions_user_id_fkey;

alter table public.user_artwork_submissions
  add constraint user_artwork_submissions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

drop policy if exists submissions_insert_own on public.user_artwork_submissions;
create policy submissions_insert_authenticated
on public.user_artwork_submissions
for insert
to authenticated
with check (user_id is null or user_id = auth.uid());

create policy submissions_insert_anon
on public.user_artwork_submissions
for insert
to anon
with check (user_id is null);

drop policy if exists submissions_select_own_or_admin on public.user_artwork_submissions;
create policy submissions_select_own_or_admin
on public.user_artwork_submissions
for select
to authenticated
using (
  (user_id is not null and user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- Anonymous uploads: path submissions/anonymous/<filename>
drop policy if exists submission_uploads_insert_anon_anonymous_prefix on storage.objects;
create policy submission_uploads_insert_anon_anonymous_prefix
on storage.objects
for insert
to anon
with check (
  bucket_id = 'submission-uploads'
  and (storage.foldername(name))[1] = 'submissions'
  and (storage.foldername(name))[2] = 'anonymous'
);

drop policy if exists submission_uploads_insert_auth_anonymous_prefix on storage.objects;
create policy submission_uploads_insert_auth_anonymous_prefix
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'submission-uploads'
  and (storage.foldername(name))[1] = 'submissions'
  and (storage.foldername(name))[2] = 'anonymous'
);
