-- ONLY in the disposable database used for booking_operations_rules.sql.
insert into public.usuarios(id,nombre,rol,activo) values
('55555555-5555-4555-8555-555555555555','Client','CLIENTE',true),
('66666666-6666-4666-8666-666666666666','Other client','CLIENTE',true);
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,
    duracion_estimada_minutos,modalidad,ubicacion_publica,latitud,longitud)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Workshop painting','Concurrent booking test',20000,60,
    'TALLER','Avenida Central 123',-33.45,-70.66);
insert into public.disponibilidades(servicio_id,inicio_en,fin_en)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '24 hours',now()+interval '48 hours');
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,precio_base,
    duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio)
select id,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',client_id,'11111111-1111-4111-8111-111111111111',
    'Workshop painting',20000,60,'TALLER',now()+interval '25 hours',now()+interval '26 hours','Avenida Central 123'
from (values
 ('a4444444-4444-4444-8444-444444444444'::uuid,'55555555-5555-4555-8555-555555555555'::uuid),
 ('b4444444-4444-4444-8444-444444444444'::uuid,'66666666-6666-4666-8666-666666666666'::uuid)
) v(id,client_id);
