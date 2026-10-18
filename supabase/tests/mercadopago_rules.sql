-- Disposable DB: no calls to Mercado Pago or shared Supabase.
begin;
create function pg_temp.expect_mp_failure(query text,expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then if sqlstate=expected_state then return; end if; raise; end;
    raise exception 'Expected SQLSTATE %',expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,precio_base,
    duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,cliente_nombre,estado)
select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','MP test',20000,60,'DOMICILIO',
    now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour','Private address 123','Client',
    (case when n=3 then 'PENDIENTE' else 'ACEPTADA' end)::public.estado_solicitud
from generate_series(1,3) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare first jsonb; again jsonb; begin
    first:=public.iniciar_checkout_mercadopago('98000000-0000-4000-8000-000000000001');
    again:=public.iniciar_checkout_mercadopago('98000000-0000-4000-8000-000000000001');
    if first->>'creado'<>'true' or again->>'creado'<>'false'
        or first->'checkout'->>'id'<>again->'checkout'->>'id'
        or first->'checkout'->>'monto_total'<>'23000' then raise exception 'Duplicate checkout or wrong amount'; end if;
end; $$;
select public.iniciar_checkout_mercadopago('98000000-0000-4000-8000-000000000002');
select pg_temp.expect_mp_failure($q$select public.iniciar_checkout_mercadopago('98000000-0000-4000-8000-000000000003')$q$,'PT409');
select pg_temp.expect_mp_failure($q$select public.simular_pago_solicitud('98000000-0000-4000-8000-000000000001')$q$,'PT409');
select pg_temp.expect_mp_failure($q$select public.simular_pago_solicitud_sin_checkout('98000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.expect_mp_failure($q$update public.checkout_mercadopago set estado='APROBADO'$q$,'42501');
select pg_temp.expect_mp_failure($q$select public.procesar_pago_mercadopago(gen_random_uuid(),'1','approved',23000,'CLP','123',false,now(),now())$q$,'42501');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin if exists(select 1 from public.checkout_mercadopago) then raise exception 'Other user leaked checkout'; end if; end; $$;
select pg_temp.expect_mp_failure($q$select public.iniciar_checkout_mercadopago('98000000-0000-4000-8000-000000000001')$q$,'42501');
reset role;
do $$ declare c uuid; r jsonb; c2 uuid; begin
    select id into c from public.checkout_mercadopago where solicitud_id='98000000-0000-4000-8000-000000000001';
    select id into c2 from public.checkout_mercadopago where solicitud_id='98000000-0000-4000-8000-000000000002';
    perform public.guardar_preferencia_mercadopago(c,'pref-test','https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-test','123');
    perform public.guardar_preferencia_mercadopago(c2,'pref-cancel','https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-cancel','123');
    perform pg_temp.expect_mp_failure(format($q$select public.procesar_pago_mercadopago(%L,'100','approved',23000,'CLP','123',true,now(),now())$q$,c),'22023');
    perform pg_temp.expect_mp_failure(format($q$select public.procesar_pago_mercadopago(%L,'100','approved',1,'CLP','123',false,now(),now())$q$,c),'22023');
    perform pg_temp.expect_mp_failure(format($q$select public.procesar_pago_mercadopago(%L,'100','approved',23000,'USD','123',false,now(),now())$q$,c),'22023');
    perform pg_temp.expect_mp_failure(format($q$select public.procesar_pago_mercadopago(%L,'100','approved',23000,'CLP','999',false,now(),now())$q$,c),'22023');
    r:=public.procesar_pago_mercadopago(c,'100','pending',23000,'CLP','123',false,null,now());
    if r->>'estado'<>'PENDIENTE' then raise exception 'Pending prematurely paid'; end if;
    r:=public.procesar_pago_mercadopago(c,'100','approved',23000,'CLP','123',false,now(),now()+interval '1 second');
    if r->>'estado'<>'APROBADO' then raise exception 'Approval failed'; end if;
    if (select estado from public.solicitudes where id='98000000-0000-4000-8000-000000000001')<>'PAGADA'
        or (select count(*) from public.pagos where solicitud_id='98000000-0000-4000-8000-000000000001')<>1
        then raise exception 'Missing receipt or status'; end if;
    perform public.procesar_pago_mercadopago(c,'100','approved',23000,'CLP','123',false,now(),now()+interval '1 second');
    perform public.procesar_pago_mercadopago(c,'100','pending',23000,'CLP','123',false,null,now());
    if (select estado from public.checkout_mercadopago where id=c)<>'APROBADO' then raise exception 'Old event downgraded payment'; end if;
    -- Separate approval for the same booking must never create a second receipt.
    r:=public.procesar_pago_mercadopago(c,'101','approved',23000,'CLP','123',false,now(),now()+interval '2 seconds');
    if r->>'estado'<>'REVISION' then raise exception 'Duplicate provider payment not flagged'; end if;
    update public.solicitudes set estado='CANCELADA',motivo_cancelacion='Cambio de planes'
        where id='98000000-0000-4000-8000-000000000002';
    r:=public.procesar_pago_mercadopago(c2,'102','approved',23000,'CLP','123',false,now(),now());
    if r->>'estado'<>'REVISION' or exists(select 1 from public.pagos where solicitud_id='98000000-0000-4000-8000-000000000002')
        then raise exception 'Cancelled booking reactivated'; end if;
end; $$;
set local role anon;
select pg_temp.expect_mp_failure($q$select * from public.checkout_mercadopago$q$,'42501');
select pg_temp.expect_mp_failure($q$select * from public.eventos_pago_mercadopago$q$,'42501');
rollback;
