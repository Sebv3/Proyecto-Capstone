-- SCRUM-43/44. Disposable database only; never run in shared Supabase.
-- Run certifications_fixture.sql, the certifications migration and the
-- service_locations migration before this script. Assertions use real SQL/RLS.
begin;
insert into public.servicios(
    id, trabajador_id, categoria_id, nombre, descripcion, precio_base,
    duracion_estimada_minutos, modalidad, ubicacion_publica, latitud, longitud,
    radio_cobertura_km, creado_en
) values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Pintura de puerta', 'Pintura interior de madera',
 20000, 60, 'DOMICILIO', 'Sector Plaza Central', -33.45, -70.66, 5, '2026-10-02'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Restauracion de muebles', 'Reparacion y pintura de puerta',
 30000, 90, 'TALLER', 'Avenida Central 123', -33.44, -70.65, null, '2026-10-03');

set local role anon;
do $$ begin
    if (select count(*) from public.buscar_servicios_catalogo()) <> 2 then
        raise exception 'Eligible offers missing or uncertified legacy offer leaked';
    end if;
    if (select count(*) from public.buscar_servicios_catalogo(p_q => ' puerta ')) <> 2 then
        raise exception 'Search must match name and description and trim whitespace';
    end if;
    if (select count(*) from public.buscar_servicios_catalogo(
        p_q => 'puerta', p_categoria_id => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        p_modalidad => 'DOMICILIO', p_precio_min => 20000, p_precio_max => 20000
    )) <> 1 then raise exception 'Combined filters or inclusive prices failed'; end if;
    if exists(select 1 from public.buscar_servicios_catalogo(p_q => 'inexistente')) then
        raise exception 'Unmatched search returned results';
    end if;
    if (select id from public.buscar_servicios_catalogo(p_limit => 1))
        <> 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid then
        raise exception 'Newest service must appear first';
    end if;
    if (select total_count from public.buscar_servicios_catalogo(p_limit => 1, p_offset => 1)) <> 2
        or (select id from public.buscar_servicios_catalogo(p_limit => 1, p_offset => 1))
        <> 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid then
        raise exception 'Pagination lost total or repeated the first result';
    end if;
    if exists(select 1 from public.buscar_servicios_catalogo(p_offset => 2)) then
        raise exception 'Offset beyond catalog must return no rows';
    end if;
    if (select ubicacion_publica from public.buscar_servicios_catalogo(
        p_servicio_id => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )) <> 'Avenida Central 123' then raise exception 'Detail omitted public location'; end if;
end; $$;
reset role;

-- Include hidden legacy offers in the five-active-service limit.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.servicios(
    trabajador_id, categoria_id, nombre, descripcion, precio_base,
    duracion_estimada_minutos, modalidad, ubicacion_publica, latitud, longitud,
    radio_cobertura_km
)
select '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'Oferta adicional ' || i, 'Pintura domiciliaria de prueba', 10000,
       60, 'DOMICILIO'::public.modalidad_servicio, 'Sector Plaza Central', -33.45, -70.66, 5
from generate_series(1, 2) i;
do $$ begin
    begin
        insert into public.servicios(
            trabajador_id, categoria_id, nombre, descripcion, precio_base,
            duracion_estimada_minutos, modalidad, ubicacion_publica, latitud,
            longitud, radio_cobertura_km
        ) values (
            '11111111-1111-4111-8111-111111111111',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Sexta oferta',
            'Servicio domiciliario de prueba', 10000, 60, 'DOMICILIO',
            'Sector Plaza Central', -33.45, -70.66, 5
        );
        raise exception 'Sixth active service was accepted';
    exception when raise_exception then
        if sqlerrm not like '%maximo cinco%' then raise; end if;
    end;
    begin
        update public.servicios set categoria_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        where nombre = 'Pintura de puerta';
        raise exception 'Category change bypassed certification';
    exception when check_violation then null;
    end;
end; $$;
-- Return to the original data before checking withdrawn approval.
update public.servicios set activo = false where nombre like 'Oferta adicional %';
reset role;

update public.verificaciones_trabajador set estado = 'RECHAZADA';
set local role anon;
do $$ begin
    if exists(select 1 from public.buscar_servicios_catalogo())
        or exists(select 1 from public.consultar_servicios_mapa()) then
        raise exception 'Unapproved worker leaked through catalog or map RPC';
    end if;
end; $$;
reset role;
do $$ begin
    begin
        update public.servicios set activo = true where nombre = 'Pintura de puerta';
        raise exception 'Unapproved worker could publish';
    exception when raise_exception then
        if sqlerrm not like '%verificacion aprobada%' then raise; end if;
    end;
end; $$;
-- Deactivation must remain available after losing approval.
update public.servicios set activo = false where nombre = 'Pintura de puerta';
update public.verificaciones_trabajador set estado = 'APROBADA';
update public.usuarios set activo = false where rol = 'TRABAJADOR';
set local role anon;
do $$ begin
    if exists(select 1 from public.buscar_servicios_catalogo()) then
        raise exception 'Inactive worker leaked';
    end if;
end; $$;
reset role;
update public.usuarios set activo = true where rol = 'TRABAJADOR';
update public.categorias set activa = false;
set local role anon;
do $$ begin
    if exists(select 1 from public.buscar_servicios_catalogo()) then
        raise exception 'Inactive category leaked';
    end if;
end; $$;
reset role;
rollback;
select 'Catalog filters, pagination, detail, visibility and publication passed' as result;
