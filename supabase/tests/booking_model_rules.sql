-- Disposable DB only: certifications fixture, then booking migration.
begin;
insert into public.usuarios(id,nombre,rol,activo) values
('55555555-5555-4555-8555-555555555555','Client','CLIENTE',true);
insert into public.solicitudes(
    id, servicio_id, cliente_id, trabajador_id, servicio_nombre, precio_base,
    duracion_estimada_minutos, modalidad, inicio_en, ubicacion_servicio
)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', id,
    '55555555-5555-4555-8555-555555555555', trabajador_id,
    'Servicio de prueba', 10000, 60, 'DOMICILIO', now() + interval '1 day',
    'Direccion privada del cliente'
from public.servicios limit 1;

create function pg_temp.expect_booking_failure(query text, expected_state text)
returns void language plpgsql as $$
begin
    begin execute query;
    exception when others then
        if sqlstate = expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE % for %', expected_state, query;
end; $$;

set local role anon;
select pg_temp.expect_booking_failure('select * from public.solicitudes', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ begin
    if (select count(*) from public.solicitudes) <> 1 then raise exception 'Client cannot read booking'; end if;
end; $$;
select pg_temp.expect_booking_failure('update public.solicitudes set estado=''ACEPTADA''','42501');
select pg_temp.expect_booking_failure('delete from public.solicitudes','42501');
select pg_temp.expect_booking_failure('insert into public.solicitudes default values','42501');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if (select count(*) from public.solicitudes) <> 1 then raise exception 'Worker cannot read booking'; end if;
end; $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
    if exists(select 1 from public.solicitudes) then raise exception 'Third party read private booking/address'; end if;
end; $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
    if (select count(*) from public.solicitudes) <> 1 then raise exception 'Admin cannot read booking'; end if;
end; $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin
    if exists(select 1 from public.solicitudes) then raise exception 'Inactive admin read booking'; end if;
end; $$;
reset role;
select pg_temp.expect_booking_failure('update public.solicitudes set estado=''LISTO''','23514');
select pg_temp.expect_booking_failure('update public.solicitudes set estado=''CANCELADA''','23514');
select pg_temp.expect_booking_failure('update public.solicitudes set cliente_id=trabajador_id','23514');
select pg_temp.expect_booking_failure('delete from public.servicios','23503');
update public.servicios set nombre='Oferta modificada',precio_base=30000;
do $$ begin
    if (select servicio_nombre from public.solicitudes limit 1) <> 'Servicio de prueba'
        or (select precio_base from public.solicitudes limit 1) <> 10000 then
        raise exception 'Editing the service modified booking snapshots';
    end if;
end; $$;
update public.solicitudes set modalidad='TALLER';
select pg_temp.expect_booking_failure('update public.solicitudes set estado=''EN_CAMINO''','23514');
update public.solicitudes set estado='CANCELADA',motivo_cancelacion='Cambio de planes';
rollback;
select 'Booking model constraints, history and private reads passed' as result;
