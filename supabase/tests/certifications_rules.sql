-- Run after certifications_fixture.sql and 20261005120000_worker_certifications.sql.
create function pg_temp.expect_failure(query text, expected_state text) returns void
language plpgsql as $$
declare failed boolean := false;
begin
    begin execute query;
    exception when others then
        if sqlstate <> expected_state then raise; end if;
        failed := true;
    end;
    if not failed then raise exception 'Expected SQLSTATE % for %', expected_state, query; end if;
end;
$$;
set role anon;
do $$ begin
    if (select count(*) from public.buscar_servicios_catalogo()) <> 0 then raise exception 'Old uncertified offer leaked'; end if;
end; $$;
select pg_temp.expect_failure('select * from public.certificaciones_trabajador', '42501');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select pg_temp.expect_failure($q$insert into storage.objects values ('certificaciones-trabajador',
 '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fake.pdf')$q$, '42501');
insert into storage.objects values ('certificaciones-trabajador',
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/license.pdf');
insert into public.certificaciones_trabajador(trabajador_id,categoria_id,nombre,documento_path)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Licencia SEC',
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/license.pdf');
select pg_temp.expect_failure($q$update public.certificaciones_trabajador set estado='APROBADA'$q$, '42501');
select pg_temp.expect_failure($q$select public.revisar_certificacion_trabajador(
 (select id from public.certificaciones_trabajador limit 1), 'APROBADA')$q$, '42501');
-- Pending does not grant publication, including changes to old active offers.
select pg_temp.expect_failure($q$insert into public.servicios(trabajador_id,categoria_id,nombre)
 values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Pending offer')$q$, '23514');
select pg_temp.expect_failure($q$update public.servicios set nombre='Bypass edit'$q$, '23514');
-- Referenced documents cannot be deleted; pending cannot be overwritten or resubmitted.
do $$ begin
    delete from storage.objects;
    if (select count(*) from storage.objects) <> 1 then raise exception 'Referenced document deleted'; end if;
    update public.certificaciones_trabajador set nombre='Illegal rename';
    if (select nombre from public.certificaciones_trabajador limit 1) <> 'Licencia SEC' then raise exception 'Pending document changed'; end if;
end; $$;
select pg_temp.expect_failure($q$insert into storage.objects values ('certificaciones-trabajador',
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/overwrite.pdf')$q$, '42501');
-- An unrelated worker sees neither the certificate nor its file.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin
    if (select count(*) from public.certificaciones_trabajador) <> 0
       or (select count(*) from storage.objects) <> 0 then raise exception 'Private document leaked'; end if;
end; $$;
-- Inactive admins cannot review. Active admins must specify a rejection reason.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
select pg_temp.expect_failure($q$select public.revisar_certificacion_trabajador(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','APROBADA')$q$, '42501');
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select pg_temp.expect_failure($q$select public.revisar_certificacion_trabajador(
 (select id from public.certificaciones_trabajador limit 1),'RECHAZADA')$q$, '22023');
select public.revisar_certificacion_trabajador(
 (select id from public.certificaciones_trabajador limit 1),'RECHAZADA','Documento ilegible');
-- Rejected certificates can be resent with a new file; review fields reset.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into storage.objects values ('certificaciones-trabajador',
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/retry.pdf');
update public.certificaciones_trabajador set documento_path=
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/retry.pdf';
do $$ begin
    if not exists (select 1 from public.certificaciones_trabajador where estado='PENDIENTE'
        and motivo_rechazo is null and revisado_por is null and revisado_en is null) then
        raise exception 'Resubmission did not reset review'; end if;
end; $$;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
select public.revisar_certificacion_trabajador(
 (select id from public.certificaciones_trabajador limit 1),'APROBADA');
select pg_temp.expect_failure($q$select public.revisar_certificacion_trabajador(
 (select id from public.certificaciones_trabajador limit 1),'RECHAZADA','Second review')$q$, 'P0002');
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
insert into public.servicios(trabajador_id,categoria_id,nombre)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Approved offer');
-- Category approval is specific: it cannot authorize a different profession.
select pg_temp.expect_failure($q$update public.servicios set categoria_id=
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' where nombre='Approved offer'$q$, '23514');
insert into public.servicios(trabajador_id,categoria_id,nombre)
values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Painting offer');
update public.servicios set activo=false where nombre='Old service';
reset role;
set role anon;
do $$ begin
    if (select count(*) from public.servicios) <> 2 then raise exception 'Public visibility wrong'; end if;
    if (select count(*) from public.buscar_servicios_catalogo()) <> 2 then raise exception 'RPC visibility wrong'; end if;
end; $$;
reset role;
select 'Certification RLS, storage, review and category publication checks passed' as result;
