-- Run after notifications_rules.sql in its disposable database only.
begin;
alter table public.solicitudes disable trigger solicitudes_notificar;
do $$ declare
    booking uuid; status text; past boolean; recipient uuid;
    worker uuid := '11111111-1111-4111-8111-111111111111';
    client uuid := '22222222-2222-4222-8222-222222222222';
begin
    foreach status in array array['PENDIENTE','ACEPTADA','PAGADA','EN_CAMINO','EN_CURSO',
                                  'LISTO','COMPLETADA','CANCELADA','RECHAZADA'] loop
        foreach past in array array[true,false] loop
            booking := gen_random_uuid();
            insert into public.solicitudes(id, cliente_id, trabajador_id, servicio_nombre, estado, inicio_en)
            values(booking,client,worker,'Test',status,now() + case when past then interval '-1 day' else interval '1 day' end);
            foreach recipient in array array[worker, client] loop
                insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje,leida_en)
                values(recipient,'SOLICITUD',booking,'Test','Test',case when past then null else now() end);
            end loop;
        end loop;
    end loop;
    -- Unknown references and unrelated processes must not be purged.
    insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje)
    values(worker,'VERIFICACION',worker,'Review','Review'),
          (worker,'SOLICITUD',gen_random_uuid(),'Missing','Missing');
    booking := gen_random_uuid();
    insert into public.solicitudes(id,cliente_id,trabajador_id,servicio_nombre,estado,inicio_en)
    values(booking,client,client,'Foreign','COMPLETADA',now());
    insert into public.notificaciones(usuario_id,tipo,referencia_id,titulo,mensaje)
    values(worker,'SOLICITUD',booking,'Foreign','Foreign');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    if public.limpiar_notificaciones_finalizadas() <> 8 then
        raise exception 'Expected six terminal and two overdue notices';
    end if;
    if (select count(*) from public.notificaciones) <> 13 then
        raise exception 'Active, unknown or verification notices lost';
    end if;
    if public.limpiar_notificaciones(false) <> 0 or public.limpiar_notificaciones(true) <> 0 then
        raise exception 'Legacy endpoint bypassed retention';
    end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
    if (select count(*) from public.notificaciones) <> 18 then raise exception 'Foreign deletion'; end if;
    if public.limpiar_notificaciones_finalizadas() <> 8 then raise exception 'Client clear failed'; end if;
    if (select count(*) from public.notificaciones) <> 10 then raise exception 'Active client notices lost'; end if;
end $$;
reset role;
do $$ begin
    if (select count(*) from public.solicitudes) <> 19 then raise exception 'Bookings were deleted'; end if;
end $$;
update public.usuarios set activo=false where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
    begin
        perform public.limpiar_notificaciones_finalizadas();
        raise exception 'Inactive user clear allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
    begin
        perform public.limpiar_notificaciones_finalizadas();
        raise exception 'Anonymous clear allowed';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
