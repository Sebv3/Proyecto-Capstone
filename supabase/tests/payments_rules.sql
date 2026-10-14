-- Only for the disposable integration database, after payment migration.
begin;
create function pg_temp.expect_payment_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate = expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE %', expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,
    precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,
    cliente_nombre,estado,motivo_cancelacion)
select ('90000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','Payment test',
    case when n=1 then 10 else 20000 end,60,'DOMICILIO',
    now() + (case when n=5 then -1 else n end)*interval '1 day',
    now() + (case when n=5 then -1 else n end)*interval '1 day'+interval '1 hour',
    'Private address 123','Client',
    (case n when 2 then 'PENDIENTE' when 3 then 'CANCELADA' when 4 then 'RECHAZADA'
        else 'ACEPTADA' end)::public.estado_solicitud,
    case when n=3 then 'Cambio de planes' else null end
from generate_series(1,6) n;

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare result jsonb; retry jsonb; begin
    result := public.consultar_pago_solicitud('90000000-0000-4000-8000-000000000001');
    if result->>'comision' <> '2' or result->>'monto_total' <> '12' then
        raise exception 'Half peso must round up';
    end if;
    result := public.simular_pago_solicitud('90000000-0000-4000-8000-000000000001');
    retry := public.simular_pago_solicitud('90000000-0000-4000-8000-000000000001');
    if result->'pago'->>'id' <> retry->'pago'->>'id'
        or result->'solicitud'->>'estado' <> 'PAGADA'
        or (select count(*) from public.pagos) <> 1 then
        raise exception 'Payment must be atomic and idempotent';
    end if;
end; $$;
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000002')$q$,'PT409');
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000003')$q$,'PT409');
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000004')$q$,'PT409');
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000005')$q$,'PT409');
select pg_temp.expect_payment_failure($q$update public.pagos set monto_total=1$q$,'42501');
select pg_temp.expect_payment_failure($q$delete from public.pagos$q$,'42501');
select pg_temp.expect_payment_failure($q$insert into public.pagos default values$q$,'42501');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin if exists(select 1 from public.pagos) then raise exception 'Foreign payment leaked'; end if; end; $$;
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.expect_payment_failure($q$select public.consultar_pago_solicitud('90000000-0000-4000-8000-000000000001')$q$,'P0002');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin if (select count(*) from public.pagos) <> 1 then raise exception 'Worker cannot read receipt'; end if; end; $$;
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000006')$q$,'42501');
reset role;
update public.usuarios set activo=false where id='55555555-5555-4555-8555-555555555555';
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000006')$q$,'42501');
do $$ begin if exists(select 1 from public.pagos) then raise exception 'Inactive client can read payment'; end if; end; $$;
reset role;
update public.usuarios set activo=true where id='55555555-5555-4555-8555-555555555555';
-- Force the state update to fail: the payment insert must roll back as well.
create function pg_temp.fail_paid_update() returns trigger language plpgsql as $$ begin
    if new.id='90000000-0000-4000-8000-000000000006' and new.estado='PAGADA' then
        raise exception 'Atomicity probe' using errcode='PT409';
    end if;
    return new;
end; $$;
create trigger payment_atomicity_probe before update on public.solicitudes
for each row execute function pg_temp.fail_paid_update();
set local role authenticated;
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000006')$q$,'PT409');
do $$ begin
    if exists(select 1 from public.pagos where solicitud_id='90000000-0000-4000-8000-000000000006')
        or (select estado from public.solicitudes where id='90000000-0000-4000-8000-000000000006') <> 'ACEPTADA' then
        raise exception 'Failed state update left a payment';
    end if;
end; $$;
set local role anon;
select pg_temp.expect_payment_failure($q$select public.simular_pago_solicitud('90000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.expect_payment_failure($q$select * from public.pagos$q$,'42501');
rollback;
