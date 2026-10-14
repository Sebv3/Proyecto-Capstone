-- Disposable integration DB only. Tests the current completion contract.
begin;
create function pg_temp.expect_confirmation_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate=expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE %', expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,
    precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,
    cliente_nombre,estado)
select ('91000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','Confirmation test',20000,60,
    (case when n=1 then 'DOMICILIO' else 'TALLER' end)::public.modalidad_servicio,
    now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour',
    'Private address 123','Client',
    (case when n=1 then 'EN_CURSO' else 'LISTO' end)::public.estado_solicitud
from generate_series(1,2) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_confirmation_failure($q$select public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000001','123456')$q$,'42501');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select pg_temp.expect_confirmation_failure($q$select public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000001','123456')$q$,'42501');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare expires timestamptz; begin
    expires := public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000001','012345');
    if expires <> now()+interval '24 hours' then raise exception 'Wrong expiration'; end if;
end; $$;
select pg_temp.expect_confirmation_failure($q$select public.completar_solicitud('91000000-0000-4000-8000-000000000001','012345')$q$,'P0002');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.expect_confirmation_failure($q$select public.completar_solicitud('91000000-0000-4000-8000-000000000001','012345')$q$,'P0002');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if public.completar_solicitud('91000000-0000-4000-8000-000000000001','000000')->>'error' <> 'codigo_invalido' then
        raise exception 'Wrong code accepted';
    end if;
    if public.completar_solicitud('91000000-0000-4000-8000-000000000001','012345')->>'estado' <> 'COMPLETADA' then
        raise exception 'Worker could not finish with client code';
    end if;
end; $$;
select pg_temp.expect_confirmation_failure($q$select public.completar_solicitud('91000000-0000-4000-8000-000000000001','012345')$q$,'PT409');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000002','123456');
reset role;
update public.confirmaciones_solicitud set expira_en=now()-interval '1 second'
where solicitud_id='91000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if public.completar_solicitud('91000000-0000-4000-8000-000000000002','123456')->>'error' <> 'codigo_no_disponible' then
        raise exception 'Expired code accepted';
    end if;
end; $$;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000002','654321');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    for attempt in 1..5 loop
        perform public.completar_solicitud('91000000-0000-4000-8000-000000000002','000000');
    end loop;
    if public.completar_solicitud('91000000-0000-4000-8000-000000000002','654321')->>'error' <> 'codigo_no_disponible' then
        raise exception 'Attempts not enforced';
    end if;
end; $$;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_confirmation_failure($q$select public.generar_codigo_solicitud('91000000-0000-4000-8000-000000000002','123456')$q$,'PT409');
rollback;
