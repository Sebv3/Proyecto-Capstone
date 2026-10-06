-- Run fixture + certifications migration, then this script in an empty disposable DB.
-- Establish a legacy, eligible offer BEFORE adding the required location fields.
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,duracion_estimada_minutos,modalidad)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Legacy painting','Existing painting offer',20000,60,'DOMICILIO');
\i /fixtures/migrations/20261005180000_service_locations.sql

create function pg_temp.expect_location_failure(query text) returns void language plpgsql as $$
begin
    begin execute query;
    exception when check_violation then return; end;
    raise exception 'An invalid location was accepted: %', query;
end; $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select pg_temp.expect_location_failure($q$insert into public.servicios(trabajador_id,categoria_id,nombre)
values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Missing location')$q$);
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,duracion_estimada_minutos,modalidad,
    ubicacion_publica,latitud,longitud,radio_cobertura_km) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Home painting','Painting at client address',20000,60,'DOMICILIO','Sector Plaza Central',-33.45,-70.66,5),
('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Workshop painting','Painting at workshop',30000,90,'TALLER','Avenida Central 123',-33.44,-70.65,null);
select pg_temp.expect_location_failure($q$update public.servicios set latitud=91 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$q$);
select pg_temp.expect_location_failure($q$update public.servicios set radio_cobertura_km=null where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$q$);
select pg_temp.expect_location_failure($q$update public.servicios set radio_cobertura_km=5 where id='ffffffff-ffff-4fff-8fff-ffffffffffff'$q$);
-- An unrelated worker cannot change these points.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
update public.servicios set latitud=0 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
reset role;
set role anon;
do $$ begin
    if (select count(*) from public.consultar_servicios_mapa()) <> 2 then raise exception 'Located offers missing or unlocated offer leaked'; end if;
    if (select count(distinct value->>'modalidad') from public.consultar_servicios_mapa() value) <> 2 then raise exception 'A modality is missing'; end if;
    if exists(select 1 from public.consultar_servicios_mapa() value where (value->>'latitud')::numeric=0) then raise exception 'A third party changed the location'; end if;
    if (select ubicacion_publica from public.buscar_servicios_catalogo(p_servicio_id=>'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')) <> 'Sector Plaza Central' then raise exception 'Catalogue detail omitted location'; end if;
end; $$;
reset role;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
do $$ begin
    if exists(select 1 from public.consultar_servicios_mapa()) then raise exception 'Inactive worker exposed'; end if;
end; $$;
update public.usuarios set activo=true where id='11111111-1111-4111-8111-111111111111';
update public.categorias set activa=false where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ begin
    if exists(select 1 from public.consultar_servicios_mapa()) then raise exception 'Inactive category exposed'; end if;
end; $$;
update public.categorias set activa=true where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.servicios set activo=false where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select 'Service locations, ownership, coverage and legacy compatibility passed' as result;
