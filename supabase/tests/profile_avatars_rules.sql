-- Disposable integration database only; roll back all test uploads and users.
begin;
insert into public.usuarios(id, nombre, rol, activo)
values ('88888888-8888-4888-8888-888888888888', 'Inactive avatar test', 'CLIENTE', false);

do $$ begin
    if not exists (select 1 from storage.buckets where id = 'profile-avatars'
                   and public and file_size_limit = 5242880
                   and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']) then
        raise exception 'Missing avatar bucket limits';
    end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
insert into storage.objects(bucket_id, name)
values ('profile-avatars', '55555555-5555-4555-8555-555555555555/photo.jpg');
do $$ begin
    begin
        insert into storage.objects(bucket_id, name)
        values ('profile-avatars', '11111111-1111-4111-8111-111111111111/foreign.jpg');
        raise exception 'Foreign avatar insert was allowed';
    exception when insufficient_privilege then null;
    end;
end $$;

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into storage.objects(bucket_id, name)
values ('profile-avatars', '11111111-1111-4111-8111-111111111111/worker.jpg');
do $$ declare affected integer; begin
    delete from storage.objects where bucket_id = 'profile-avatars'
        and name = '55555555-5555-4555-8555-555555555555/photo.jpg';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Foreign avatar deletion was allowed'; end if;
    delete from storage.objects where bucket_id = 'profile-avatars'
        and name = '11111111-1111-4111-8111-111111111111/worker.jpg';
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Own avatar deletion was blocked'; end if;
end $$;

set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
do $$ begin
    begin
        insert into storage.objects(bucket_id, name)
        values ('profile-avatars', '88888888-8888-4888-8888-888888888888/photo.jpg');
        raise exception 'Inactive avatar insert was allowed';
    exception when insufficient_privilege then null;
    end;
end $$;
rollback;
