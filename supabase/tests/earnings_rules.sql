-- Isolated fixtures only; rollback leaves the integration database unchanged.
begin;
create function pg_temp.expect_earnings_failure(query text,expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then if sqlstate=expected_state then return; end if; raise; end;
    raise exception 'Expected SQLSTATE %',expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,precio_base,
    duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,cliente_nombre,
    estado,motivo_cancelacion,actualizado_en)
select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','Earnings test',20000,60,'DOMICILIO',
    '2040-09-15T12:00:00Z'::timestamptz+n*interval '1 day',
    '2040-09-15T13:00:00Z'::timestamptz+n*interval '1 day','Private address 123','Client',
    (case n when 3 then 'PAGADA' when 4 then 'CANCELADA' when 5 then 'PENDIENTE'
        else 'COMPLETADA' end)::public.estado_solicitud,
    case when n=4 then 'Cambio de planes' end,
    case n when 1 then '2040-10-01T01:00:00Z'::timestamptz -- still September in Chile
        when 2 then '2040-10-01T12:00:00Z'::timestamptz else '2040-09-22T12:00:00Z'::timestamptz end
from generate_series(1,6) n;
-- Completed but unpaid (n=6) must not be counted, nor cancelled or pending services.
insert into public.pagos(solicitud_id,cliente_id,trabajador_id,tarifa_base,comision,monto_total)
select id,cliente_id,trabajador_id,20000,3000,23000 from public.solicitudes
where id::text like '97000000-%' and right(id::text,1) <> '6';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare r jsonb; begin
    r:=public.consultar_ganancias_trabajador('2040-09-01',1,0);
    if r->>'total_completado'<>'20000' or r->>'cantidad_completada'<>'1'
        or r->>'total_en_curso'<>'20000' or r->>'cantidad_en_curso'<>'1'
        or r->>'has_more'<>'true' or jsonb_array_length(r->'items')<>1
        or jsonb_array_length(r->'dias')<>30 then raise exception 'Totals or pagination wrong: %',r; end if;
    if (r->'dias'->29->>'monto')<>'20000' then raise exception 'Chile day boundary incorrect'; end if;
    if (select sum((d->>'monto')::bigint) from jsonb_array_elements(r->'dias') d)<>20000
        then raise exception 'Chart must equal completed total'; end if;
    if (r->'items'->0) ? 'cliente_id' or (r->'items'->0) ? 'ubicacion_servicio'
        then raise exception 'Unnecessary private fields'; end if;
    r:=public.consultar_ganancias_trabajador('2040-09-01',1,1);
    if r->>'has_more'<>'false' or jsonb_array_length(r->'items')<>1
        or r->>'total_completado'<>'20000' then raise exception 'Page changed totals'; end if;
    r:=public.consultar_ganancias_trabajador('2040-10-01');
    if r->>'total_completado'<>'20000' or r->>'total_en_curso'<>'0'
        then raise exception 'Wrong month selected'; end if;
    r:=public.consultar_ganancias_trabajador('2040-02-01');
    if jsonb_array_length(r->'dias')<>29 or r->>'total_completado'<>'0'
        or r->'items'<>'[]'::jsonb then raise exception 'Empty leap month incorrect'; end if;
end; $$;
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-02')$q$,'22023');
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-01',0)$q$,'22023');
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-01',20,-1)$q$,'22023');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare r jsonb; begin
    r:=public.consultar_ganancias_trabajador('2040-09-01');
    if r->>'total_completado'<>'0' or r->>'total_en_curso'<>'0' or r->'items'<>'[]'::jsonb
        then raise exception 'Another worker earnings leaked'; end if;
end; $$;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-01')$q$,'42501');
reset role;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-01')$q$,'42501');
set local role anon;
select pg_temp.expect_earnings_failure($q$select public.consultar_ganancias_trabajador('2040-09-01')$q$,'42501');
rollback;
