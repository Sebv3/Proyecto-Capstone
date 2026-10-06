-- Apply 20261005150000_create_coverage_locations.sql first.
-- Run in the Supabase SQL Editor as an administrator of the project.
-- 1. Find the worker who owns the workshop services.
select t.usuario_id, u.nombre, count(s.id) as servicios_taller
from public.trabajadores t
join public.usuarios u on u.id = t.usuario_id
join public.servicios s on s.trabajador_id = t.usuario_id and s.activo and s.modalidad = 'TALLER'
where public.trabajador_puede_publicar(t.usuario_id)
group by t.usuario_id, u.nombre;

-- 2. Replace ALL example values with the actual public establishment information.
-- Coordinates can be copied manually from OpenStreetMap; no geocoding API is required.
-- Do not publish a worker's private residential address without their authorization.
-- Uncomment this statement only after replacing the worker UUID and location values.
-- insert into public.locales (trabajador_id, nombre, direccion_publica, latitud, longitud)
-- values ('UUID_DEL_TRABAJADOR'::uuid, 'NOMBRE_DEL_LOCAL', 'DIRECCION_PUBLICA', LATITUD_REAL, LONGITUD_REAL);

-- 3. Check the same public projection consumed by the app.
select * from public.consultar_locales_catalogo();

-- An active local appears only with an approved worker and eligible workshop services.
-- To hide one later: update public.locales set activo=false where id='UUID_DEL_LOCAL'::uuid;
