-- ONLY for the isolated Sprint 4 PostgreSQL/PostgREST test stack.
-- Run after certifications_fixture + certifications + locations + bookings + operations.
-- The test helpers below must NEVER be deployed to shared Supabase.
create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(
        nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
    )::uuid;
$$;
alter table public.usuarios
    add column email text,
    add column rut text default '12345678-5',
    add column telefono text,
    add column avatar_url text,
    add column creado_en timestamptz default now(),
    add column actualizado_en timestamptz default now();
update public.usuarios set email=id::text||'@example.test';
insert into public.usuarios(id,nombre,rol,activo,email) values
('55555555-5555-4555-8555-555555555555','Client','CLIENTE',true,'client@example.test'),
('66666666-6666-4666-8666-666666666666','Other client','CLIENTE',true,'other@example.test');
alter table public.usuarios enable row level security;
create policy usuarios_leer_propio on public.usuarios for select to authenticated
using(id=auth.uid() or public.es_admin());
insert into public.comunas(id,nombre) values ('77777777-7777-4777-8777-777777777777','Comuna del servicio');
grant select on public.usuarios to authenticated;
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,
    duracion_estimada_minutos,modalidad,ubicacion_publica,latitud,longitud,radio_cobertura_km) values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Home painting','Painting at client address',20000,60,
 'DOMICILIO','Sector Plaza Central',-33.45,-70.66,5),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Workshop painting','Painting at workshop',30000,90,
 'TALLER','Avenida Central 123',-33.44,-70.65,null);

create function public.test_reset_bookings() returns void language plpgsql
security definer set search_path='' as $$ begin
    if not public.es_admin() then raise insufficient_privilege; end if;
    if to_regclass('public.calificaciones') is not null then execute 'delete from public.calificaciones'; end if;
    -- payments is introduced after this fixture; resolve the table at execution time.
    if to_regclass('public.pagos') is not null then execute 'delete from public.pagos'; end if;
    delete from public.confirmaciones_solicitud;
    delete from public.solicitudes;
    delete from public.disponibilidades;
end; $$;
revoke all on function public.test_reset_bookings() from public;
grant execute on function public.test_reset_bookings() to authenticated;
