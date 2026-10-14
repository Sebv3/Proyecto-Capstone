-- Disposable database only: participants, author-only CRUD and physical cleanup.
begin;
create function pg_temp.expect_chat_failure(query text, expected_state text) returns void
language plpgsql as $$ begin
    begin execute query;
    exception when others then
        if sqlstate=expected_state then return; end if;
        raise;
    end;
    raise exception 'Expected SQLSTATE %',expected_state;
end; $$;
insert into public.solicitudes(id,servicio_id,cliente_id,trabajador_id,servicio_nombre,
    precio_base,duracion_estimada_minutos,modalidad,inicio_en,fin_en,ubicacion_servicio,cliente_nombre)
select ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111','Temporary chat test',20000,60,'DOMICILIO',
    now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour','Private address 123','Client'
from generate_series(1,3) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$ declare first jsonb; second jsonb; begin
    first:=public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','LEER');
    if first->>'conversacion_id' is not null then raise exception 'Reading created a conversation'; end if;
    first:=public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ABRIR');
    second:=public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ABRIR');
    if first->>'conversacion_id' <> second->>'conversacion_id' then raise exception 'Duplicate conversation'; end if;
    for n in 1..3 loop
        perform public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ENVIAR','Hola',
            ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
    end loop;
    perform public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ENVIAR','Hola','93000000-0000-4000-8000-000000000001');
    if (select count(*) from public.mensajes) <> 3 then raise exception 'Send retry duplicated message'; end if;
    first:=public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','LEER',p_limit=>2);
    if jsonb_array_length(first->'items')<>2 or first->>'has_more'<>'true' then raise exception 'Pagination failed'; end if;
end; $$;
select pg_temp.expect_chat_failure($q$insert into public.mensajes default values$q$,'42501');
select pg_temp.expect_chat_failure($q$update public.mensajes set contenido='Forged'$q$,'42501');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','LEER')$q$,'P0002');
do $$ begin if exists(select 1 from public.conversaciones) or exists(select 1 from public.mensajes) then raise exception 'Foreign chat leaked'; end if; end; $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin if (select count(*) from public.mensajes)<>3 then raise exception 'Worker cannot read chat'; end if; end; $$;
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','EDITAR','Forged','93000000-0000-4000-8000-000000000001')$q$,'P0002');
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ELIMINAR',p_mensaje_id=>'93000000-0000-4000-8000-000000000001')$q$,'P0002');
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','EDITAR','Nuevo texto','93000000-0000-4000-8000-000000000001');
select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ELIMINAR',p_mensaje_id=>'93000000-0000-4000-8000-000000000001');
do $$ begin
    for n in 2..3 loop
        perform public.gestionar_chat_solicitud(('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ABRIR');
        perform public.gestionar_chat_solicitud(('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ENVIAR','Temporal',
            ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
    end loop;
end; $$;
reset role;
update public.usuarios set activo=false where id='55555555-5555-4555-8555-555555555555';
set local role authenticated;
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','LEER')$q$,'P0002');
do $$ begin if exists(select 1 from public.mensajes) then raise exception 'Inactive user can read messages'; end if; end; $$;
reset role;
update public.usuarios set activo=true where id='55555555-5555-4555-8555-555555555555';
update public.solicitudes set estado='COMPLETADA' where id='92000000-0000-4000-8000-000000000001';
update public.solicitudes set estado='RECHAZADA' where id='92000000-0000-4000-8000-000000000002';
update public.solicitudes set estado='CANCELADA',motivo_cancelacion='Cambio de planes' where id='92000000-0000-4000-8000-000000000003';
do $$ begin
    if exists(select 1 from public.conversaciones) or exists(select 1 from public.mensajes) then
        raise exception 'Terminal service retained conversation or messages';
    end if;
end; $$;
set local role authenticated;
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','ABRIR')$q$,'PT410');
set local role anon;
select pg_temp.expect_chat_failure($q$select public.gestionar_chat_solicitud('92000000-0000-4000-8000-000000000001','LEER')$q$,'42501');
rollback;
