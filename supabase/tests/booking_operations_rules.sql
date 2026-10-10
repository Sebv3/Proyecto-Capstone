-- Disposable DB only: certifications fixture, certifications, locations,
-- booking model, operations and conflict-error fix migrations. Never shared Supabase.
begin;
insert into public.usuarios(id,nombre,rol,activo) values
('55555555-5555-4555-8555-555555555555','Client','CLIENTE',true),
('66666666-6666-4666-8666-666666666666','Other client','CLIENTE',true);
insert into public.servicios(id,trabajador_id,categoria_id,nombre,descripcion,precio_base,
    duracion_estimada_minutos,modalidad,ubicacion_publica,latitud,longitud,radio_cobertura_km) values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Home painting','Painting at client address',20000,60,
 'DOMICILIO','Sector Plaza Central',-33.45,-70.66,5),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Workshop painting','Painting at workshop',30000,90,
 'TALLER','Avenida Central 123',-33.44,-70.65,null);

create function pg_temp.expect_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate = expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE % for %',expected_state,query;
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.gestionar_disponibilidad('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    now()+interval '24 hours',now()+interval '48 hours');
select * from public.gestionar_disponibilidad('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    now()+interval '24 hours',now()+interval '48 hours');
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','Client address 123')$q$,'42501');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours',null)$q$,'22023');
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '23 hours','Client address 123')$q$,'PT409');
select set_config('test.home_id',id::text,true) from public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','Client address 123');
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','Client address 123')$q$,'PT409');
select pg_temp.expect_failure($q$select public.cambiar_estado_solicitud(
    current_setting('test.home_id')::uuid,'PENDIENTE','ACEPTADA')$q$,'PT409');

select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select set_config('test.overlap_id',id::text,true) from public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','Other client address 123');
select pg_temp.expect_failure($q$select public.cambiar_estado_solicitud(
    current_setting('test.home_id')::uuid,'PENDIENTE','CANCELADA','Changed plans')$q$,'P0002');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.cambiar_estado_solicitud(current_setting('test.home_id')::uuid,'PENDIENTE','ACEPTADA');
do $$ begin
    if (select estado from public.solicitudes where id=current_setting('test.overlap_id')::uuid)<>'RECHAZADA'
        then raise exception 'Overlapping pending request was not automatically rejected'; end if;
end; $$;
select pg_temp.expect_failure($q$select public.cambiar_estado_solicitud(
    current_setting('test.home_id')::uuid,'PENDIENTE','RECHAZADA')$q$,'PT409');
select pg_temp.expect_failure($q$select public.cambiar_estado_solicitud(
    current_setting('test.home_id')::uuid,'ACEPTADA','PAGADA')$q$,'PT409');
select pg_temp.expect_failure($q$select public.cambiar_estado_solicitud(
    current_setting('test.home_id')::uuid,'ACEPTADA','EN_CURSO')$q$,'PT409');
select pg_temp.expect_failure($q$select public.gestionar_disponibilidad(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',null,null,
    (select id from public.consultar_disponibilidad('dddddddd-dddd-4ddd-8ddd-dddddddddddd') limit 1))$q$,'PT409');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours 30 minutes','Client address 123')$q$,'PT409');
-- Exactly adjacent slots are allowed (half-open intervals).
select * from public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    now()+interval '26 hours','Client address 123');
reset role;
-- Only the payment integration may do this. Simulated here as database owner.
update public.solicitudes set estado='PAGADA' where id=current_setting('test.home_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.cambiar_estado_solicitud(current_setting('test.home_id')::uuid,'PAGADA','EN_CAMINO');
select * from public.cambiar_estado_solicitud(current_setting('test.home_id')::uuid,'EN_CAMINO','EN_CURSO');
select public.generar_codigo_solicitud(current_setting('test.home_id')::uuid,'123456');
select pg_temp.expect_failure('select * from public.confirmaciones_solicitud','42501');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ begin
    if public.completar_solicitud(current_setting('test.home_id')::uuid,'000000')->>'error'<>'codigo_invalido'
        then raise exception 'Wrong code was accepted'; end if;
    if public.completar_solicitud(current_setting('test.home_id')::uuid,'123456')->>'estado'<>'COMPLETADA'
        then raise exception 'Valid code could not complete service'; end if;
end; $$;
select pg_temp.expect_failure($q$select public.completar_solicitud(
    current_setting('test.home_id')::uuid,'123456')$q$,'PT409');
reset role;
do $$ begin
    if (select intentos from public.confirmaciones_solicitud
        where solicitud_id=current_setting('test.home_id')::uuid)<>1 then
        raise exception 'Invalid code did not persist attempt counter';
    end if;
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '28 hours','Forged workshop address')$q$,'22023');
select set_config('test.workshop_id',id::text,true) from public.crear_solicitud(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '28 hours');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.cambiar_estado_solicitud(current_setting('test.workshop_id')::uuid,'PENDIENTE','ACEPTADA');
reset role;
update public.solicitudes set estado='PAGADA' where id=current_setting('test.workshop_id')::uuid;
set local role authenticated;
select * from public.cambiar_estado_solicitud(current_setting('test.workshop_id')::uuid,'PAGADA','EN_CURSO');
select pg_temp.expect_failure($q$select public.generar_codigo_solicitud(
    current_setting('test.workshop_id')::uuid,'123456')$q$,'PT409');
select * from public.cambiar_estado_solicitud(current_setting('test.workshop_id')::uuid,'EN_CURSO','LISTO');
select public.generar_codigo_solicitud(current_setting('test.workshop_id')::uuid,'123456');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ begin
    for i in 1..5 loop
        perform public.completar_solicitud(current_setting('test.workshop_id')::uuid,'000000');
    end loop;
    if public.completar_solicitud(current_setting('test.workshop_id')::uuid,'123456')->>'error'
        <> 'codigo_no_disponible' then raise exception 'Attempt budget bypassed'; end if;
end; $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_failure($q$select public.generar_codigo_solicitud(
    current_setting('test.workshop_id')::uuid,'654321')$q$,'PT409');
reset role;
-- Verify expiration independently of the attempt budget.
update public.confirmaciones_solicitud set intentos=0,expira_en=now()-interval '1 minute'
where solicitud_id=current_setting('test.workshop_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ begin
    if public.completar_solicitud(current_setting('test.workshop_id')::uuid,'123456')->>'error'
        <> 'codigo_no_disponible' then raise exception 'Expired code accepted'; end if;
end; $$;
reset role;
rollback;
select 'Booking operations: availability, conflicts, actors, flows and confirmation passed' as result;
