-- Disposable DB only, after HTTP fixture and both commune migrations.
begin;
-- The minimal certifications fixture omits the real commune read grants.
grant select on public.comunas to authenticated;
insert into public.comunas(id,nombre) values ('88888888-8888-4888-8888-888888888888','Otra comuna');
create function pg_temp.expect_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate = expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE %',expected_state;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.gestionar_disponibilidad('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '24 hours',now()+interval '48 hours');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '25 hours')$q$,'22023');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.servicios set comuna_taller_id='77777777-7777-4777-8777-777777777777' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select pg_temp.expect_failure($q$update public.servicios set comuna_taller_id=null where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'$q$,'23514');
select pg_temp.expect_failure($q$update public.servicios set comuna_taller_id='77777777-7777-4777-8777-777777777777' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'$q$,'23514');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_failure($q$select public.crear_solicitud('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '25 hours','88888888-8888-4888-8888-888888888888')$q$,'22023');
select set_config('test.workshop_booking_id',id::text,true) from public.crear_solicitud('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '25 hours');
do $$ begin
    if not exists(select 1 from public.solicitudes where id=current_setting('test.workshop_booking_id')::uuid
        and comuna_servicio_id='77777777-7777-4777-8777-777777777777'
        and comuna_servicio_nombre='Comuna del servicio' and ubicacion_servicio='Avenida Central 123') then
        raise exception 'Workshop snapshot was not taken from the offer';
    end if;
end; $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.servicios set comuna_taller_id='88888888-8888-4888-8888-888888888888' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$ begin
    if not exists(select 1 from public.solicitudes where id=current_setting('test.workshop_booking_id')::uuid
        and comuna_servicio_nombre='Comuna del servicio') then
        raise exception 'Editing offer changed booking history';
    end if;
    if not exists(select 1 from public.buscar_servicios_catalogo(p_servicio_id=>'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
        where comuna_taller_nombre='Otra comuna') then
        raise exception 'Catalog does not expose workshop commune';
    end if;
end; $$;
rollback;
