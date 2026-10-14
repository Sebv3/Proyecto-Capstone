-- Disposable database only: valid author, completed booking, one review and public projection.
begin;
create function pg_temp.expect_review_failure(query text,expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then if sqlstate=expected_state then return; end if; raise; end;
    raise exception 'Expected SQLSTATE %',expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,precio_base,
    duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,cliente_nombre,estado)
select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','Review test',20000,60,'DOMICILIO',
    now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour','Private address 123','Client',
    (case when n in (1,2) then 'COMPLETADA' else 'PENDIENTE' end)::public.estado_solicitud
from generate_series(1,3) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000003',5)$q$,'PT409');
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',0)$q$,'22023');
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',6)$q$,'22023');
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',5,repeat('x',1001))$q$,'22023');
do $$ declare first jsonb; again jsonb; begin
    first:=public.crear_calificacion('95000000-0000-4000-8000-000000000001',5,' Bien ');
    again:=public.crear_calificacion('95000000-0000-4000-8000-000000000001',5,'Bien');
    if first->'calificacion'->>'id' <> again->'calificacion'->>'id' or again->>'creada'<>'false'
        or first->'calificacion'->>'cliente_id' <> auth.uid()::text then raise exception 'Retry or author invalid'; end if;
end; $$;
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',1)$q$,'PT409');
select public.crear_calificacion('95000000-0000-4000-8000-000000000002',3,'  ');
select pg_temp.expect_review_failure($q$insert into public.calificaciones default values$q$,'42501');
select pg_temp.expect_review_failure($q$update public.calificaciones set puntuacion=1$q$,'42501');
select pg_temp.expect_review_failure($q$delete from public.calificaciones$q$,'42501');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',5)$q$,'42501');
do $$ begin if (select count(*) from public.calificaciones)<>2 then raise exception 'Worker cannot read reviews'; end if; end; $$;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',5)$q$,'42501');
select pg_temp.expect_review_failure($q$select public.consultar_calificacion_solicitud('95000000-0000-4000-8000-000000000001')$q$,'P0002');
do $$ begin if exists(select 1 from public.calificaciones) then raise exception 'Private ownership leaked'; end if; end; $$;
reset role;
update public.usuarios set activo=false where id='55555555-5555-4555-8555-555555555555';
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select pg_temp.expect_review_failure($q$select public.crear_calificacion('95000000-0000-4000-8000-000000000001',5)$q$,'42501');
set local role anon;
select pg_temp.expect_review_failure($q$select * from public.calificaciones$q$,'42501');
do $$ declare result jsonb; item jsonb; begin
    result:=public.consultar_calificaciones_trabajador('11111111-1111-4111-8111-111111111111',1,0);
    if result->>'promedio'<>'4.00' or result->>'cantidad'<>'2' or result->>'has_more'<>'true' then
        raise exception 'Average, count or pagination incorrect'; end if;
    item:=result->'items'->0;
    if item ? 'cliente_id' or item ? 'solicitud_id' or item ? 'trabajador_id' or item ? 'servicio_id' then
        raise exception 'Public review leaked private identifiers'; end if;
    result:=public.consultar_calificaciones_trabajador('22222222-2222-4222-8222-222222222222');
    if result->>'promedio' is not null or result->>'cantidad'<>'0' then raise exception 'Empty average invented'; end if;
end; $$;
reset role;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
set local role anon;
select pg_temp.expect_review_failure($q$select public.consultar_calificaciones_trabajador('11111111-1111-4111-8111-111111111111')$q$,'P0002');
rollback;
