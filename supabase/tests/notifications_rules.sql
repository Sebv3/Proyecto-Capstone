-- Run only in an empty disposable PostgreSQL database, never in shared Supabase.
\set ON_ERROR_STOP on
do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated;
create table public.usuarios(id uuid primary key, activo boolean default true);
create table public.solicitudes(id uuid primary key, cliente_id uuid, trabajador_id uuid, servicio_nombre text, estado text);
create table public.verificaciones_trabajador(trabajador_id uuid primary key, estado text);
create table public.certificaciones_trabajador(id uuid primary key, trabajador_id uuid, categoria_id uuid, estado text);
create table public.solicitudes_rol_trabajador(id uuid primary key, usuario_id uuid, estado text);
grant select on public.usuarios to authenticated;
insert into public.usuarios(id) values
('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333');
\ir ../migrations/20261011120000_in_app_notifications.sql
\ir ../migrations/20261019130000_clear_notifications.sql
begin;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into public.solicitudes values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Plomería','PENDIENTE');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.solicitudes set estado='ACEPTADA';
update public.solicitudes set estado='ACEPTADA';
do $$ begin
    if (select count(*) from public.notificaciones) <> 2 then raise exception 'Duplicate or missing booking events'; end if;
end; $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
update public.solicitudes set estado='CANCELADA';
select set_config('request.jwt.claim.sub','',true);
insert into public.verificaciones_trabajador values('11111111-1111-4111-8111-111111111111','PENDIENTE');
update public.verificaciones_trabajador set estado='APROBADA';
update public.verificaciones_trabajador set estado='APROBADA';
insert into public.certificaciones_trabajador values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
'11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','PENDIENTE');
update public.certificaciones_trabajador set estado='RECHAZADA';
insert into public.solicitudes_rol_trabajador values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
'22222222-2222-4222-8222-222222222222','PENDIENTE');
update public.solicitudes_rol_trabajador set estado='APROBADA';
do $$ begin
    if (select count(*) from public.notificaciones) <> 6 then raise exception 'Review SQL changes missing'; end if;
end; $$;
select set_config('test.worker_notification',id::text,true) from public.notificaciones where tipo='VERIFICACION';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
    if (select count(*) from public.notificaciones) <> 2 then raise exception 'Cross-user read'; end if;
    if public.leer_notificaciones(current_setting('test.worker_notification')::uuid) <> 0 then raise exception 'Cross-user mark read'; end if;
    if public.leer_notificaciones(null) <> 2 then raise exception 'Mark all failed'; end if;
    if public.leer_notificaciones(null) <> 0 then raise exception 'Mark all is not idempotent'; end if;
end; $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if (select count(*) from public.notificaciones where leida_en is null) <> 4 then raise exception 'Other user read mutated'; end if;
    if public.leer_notificaciones(current_setting('test.worker_notification')::uuid) <> 1 then raise exception 'Individual read failed'; end if;
end; $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
    if exists(select 1 from public.notificaciones) then raise exception 'Unrelated user read'; end if;
    begin
        update public.notificaciones set titulo='fake';
        raise exception 'Direct update allowed';
    exception when insufficient_privilege then null; end;
    begin
        insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje)
        values(auth.uid(),'SOLICITUD',auth.uid(),'fake','fake');
        raise exception 'Direct insert allowed';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
    if public.limpiar_notificaciones() <> 2 then raise exception 'Clear read failed'; end if;
    if public.limpiar_notificaciones() <> 0 then raise exception 'Clear is not idempotent'; end if;
    begin
        delete from public.notificaciones;
        raise exception 'Direct deletion allowed';
    exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if (select count(*) from public.notificaciones) <> 4 then raise exception 'Foreign clear'; end if;
    if public.limpiar_notificaciones() <> 1 then raise exception 'Own read deletion failed'; end if;
    if (select count(*) from public.notificaciones where leida_en is null) <> 3 then
        raise exception 'Unread notifications lost';
    end if;
    if public.limpiar_notificaciones(false) <> 3 then raise exception 'Clear all failed'; end if;
    if public.limpiar_notificaciones(false) <> 0 then raise exception 'Empty clear failed'; end if;
end; $$;
reset role;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if exists(select 1 from public.notificaciones) then raise exception 'Inactive account read'; end if;
    begin
        perform public.leer_notificaciones(null);
        raise exception 'Inactive account write';
    exception when insufficient_privilege then null; end;
    begin
        perform public.limpiar_notificaciones(false);
        raise exception 'Inactive account clear';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
    begin perform public.leer_notificaciones(null); raise exception 'Anonymous RPC';
    exception when insufficient_privilege then null; end;
    begin perform public.limpiar_notificaciones(false); raise exception 'Anonymous clear';
    exception when insufficient_privilege then null; end;
    begin perform count(*) from public.notificaciones; raise exception 'Anonymous read';
    exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;

alter table public.solicitudes add column inicio_en timestamptz;
\ir ../migrations/20261019140000_clear_finished_notifications.sql
\ir finished_notifications_rules.sql
