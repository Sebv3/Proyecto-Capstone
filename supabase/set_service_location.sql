-- After 20261005180000_service_locations.sql, NEW offers save their public point from the form.
-- Existing offers remain visible in search but need a point to enter the service map.
select id, nombre, modalidad, ubicacion_publica, latitud, longitud, radio_cobertura_km
from public.servicios where activo;

-- Replace the placeholders with the owner's chosen PUBLIC location, then uncomment.
-- Home service: public reference point, plus a radius from 1 to 100 km.
-- update public.servicios set ubicacion_publica='SECTOR_PUBLICO', latitud=LATITUD_REAL,
--     longitud=LONGITUD_REAL, radio_cobertura_km=5
-- where id='UUID_DEL_SERVICIO'::uuid and modalidad='DOMICILIO';

-- Workshop service: customer-facing address, without a travel radius.
-- update public.servicios set ubicacion_publica='DIRECCION_DEL_TALLER', latitud=LATITUD_REAL,
--     longitud=LONGITUD_REAL, radio_cobertura_km=null
-- where id='UUID_DEL_SERVICIO'::uuid and modalidad='TALLER';

select * from public.consultar_servicios_mapa();
