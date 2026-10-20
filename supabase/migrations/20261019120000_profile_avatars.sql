-- Profile pictures are public assets, never identity-verification documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_avatars_insert_own on storage.objects
for insert to authenticated
with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.usuarios where id = (select auth.uid()) and activo)
);

create policy profile_avatars_select_own on storage.objects
for select to authenticated
using (bucket_id = 'profile-avatars'
       and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy profile_avatars_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'profile-avatars'
       and (storage.foldername(name))[1] = (select auth.uid())::text
       and exists (select 1 from public.usuarios where id = (select auth.uid()) and activo));
