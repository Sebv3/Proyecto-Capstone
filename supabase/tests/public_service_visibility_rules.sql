-- Disposable DB only: certifications fixture + certifications migration +
-- service_locations migration + visibility migration, then this script.
begin;

-- Match the production category RLS and helper privileges omitted by the fixture.
alter table public.categorias enable row level security;
create policy categorias_catalogo_publico on public.categorias
for select to anon, authenticated using (activa);
revoke all on function public.trabajador_puede_publicar(uuid) from public;

insert into public.servicios(
    id, trabajador_id, categoria_id, nombre, descripcion, precio_base,
    duracion_estimada_minutos, modalidad, ubicacion_publica, latitud, longitud
) values (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Pintura de prueba', 'Pintura en taller de prueba', 20000, 60, 'TALLER',
    'Sector Plaza Central', -33.45, -70.66
);

create function pg_temp.assert_visible(expected bigint) returns void
language plpgsql as $$
begin
    if (select count(*) from public.servicios) <> expected then
        raise exception 'Direct table visibility differs from expected % for role %', expected, current_user;
    end if;
    if (select count(*) from public.buscar_servicios_catalogo()) <> expected
        or (select count(*) from public.consultar_servicios_mapa()) <> expected then
        raise exception 'Catalog/map visibility differs from expected %', expected;
    end if;
end; $$;

-- An uncertified legacy offer stays hidden, an eligible offer remains visible.
set local role anon;
select pg_temp.assert_visible(1);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select pg_temp.assert_visible(1);
reset role;

update public.verificaciones_trabajador set estado = 'PENDIENTE';
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;

update public.verificaciones_trabajador set estado = 'RECHAZADA';
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;

-- Losing approval must not remove the owner's access or ability to deactivate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$ begin
    if (select count(*) from public.servicios) <> 2 then
        raise exception 'Owner lost access to hidden services';
    end if;
end; $$;
update public.servicios set activo = false
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
do $$ begin
    if not exists(select 1 from public.servicios
        where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and not activo) then
        raise exception 'Owner could not deactivate hidden service';
    end if;
end; $$;
reset role;
update public.verificaciones_trabajador set estado = 'APROBADA';
update public.servicios set activo = true
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

update public.usuarios set activo = false where rol = 'TRABAJADOR';
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select pg_temp.assert_visible(0);
reset role;
update public.usuarios set activo = true where rol = 'TRABAJADOR';

update public.usuarios set rol = 'CLIENTE'
where id = '11111111-1111-4111-8111-111111111111';
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;
update public.usuarios set rol = 'TRABAJADOR'
where id = '11111111-1111-4111-8111-111111111111';

update public.categorias set activa = false;
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;
update public.categorias set activa = true;

update public.servicios set activo = false
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;

-- Approval removal also hides services when the verification row is absent.
update public.servicios set activo = true
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set local role anon;
select pg_temp.assert_visible(1);
reset role;
delete from public.verificaciones_trabajador;
set local role anon;
select pg_temp.assert_visible(0);
reset role;
set local role authenticated;
select pg_temp.assert_visible(0);
reset role;

rollback;
select 'Direct service visibility, RPC consistency and owner access passed' as result;
