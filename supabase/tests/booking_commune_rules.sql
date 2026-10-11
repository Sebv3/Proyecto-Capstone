-- Disposable DB only, after booking_http_fixture and the service commune migration.
begin;
insert into public.comunas(id,nombre,activa) values ('88888888-8888-4888-8888-888888888888','Inactiva',false);
create function pg_temp.expect_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate = expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE %', expected_state;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.gestionar_disponibilidad('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '24 hours',now()+interval '48 hours');
select * from public.gestionar_disponibilidad('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '24 hours',now()+interval '48 hours');
select pg_temp.expect_failure($q$select public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','77777777-7777-4777-8777-777777777777','Direccion 123')$q$,'42501');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours',null,'Direccion 123')$q$,'22023');
select pg_temp.expect_failure($q$select public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','88888888-8888-4888-8888-888888888888','Direccion 123')$q$,'22023');
select set_config('test.booking_id',id::text,true) from public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','77777777-7777-4777-8777-777777777777','Direccion 123');
select pg_temp.expect_failure($q$select public.crear_solicitud('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '25 hours','77777777-7777-4777-8777-777777777777','Direccion 123')$q$,'PT409');
select * from public.crear_solicitud('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '30 hours','77777777-7777-4777-8777-777777777777');
select pg_temp.expect_failure($q$update public.solicitudes set comuna_servicio_nombre='Falsa'$q$,'42501');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
    if exists(select 1 from public.solicitudes where id=current_setting('test.booking_id')::uuid) then
        raise exception 'Unrelated client read a booking';
    end if;
end; $$;
reset role;
update public.usuarios set nombre='Nombre cambiado' where id='55555555-5555-4555-8555-555555555555';
update public.comunas set nombre='Comuna renombrada' where id='77777777-7777-4777-8777-777777777777';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if not exists(select 1 from public.solicitudes where id=current_setting('test.booking_id')::uuid
        and cliente_nombre='Client' and comuna_servicio_nombre='Comuna del servicio') then
        raise exception 'Snapshots or participant access failed';
    end if;
end; $$;
rollback;
