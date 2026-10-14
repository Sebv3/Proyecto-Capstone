-- Client authorizes completion by sharing a code; worker enters it to finish.
begin;
-- Old codes were disclosed to workers. Expire outstanding codes so that the
-- client must generate a new one. Keep failed-attempt counters and history.
update public.confirmaciones_solicitud c set expira_en=least(c.expira_en,now())
from public.solicitudes s where s.id=c.solicitud_id and s.estado <> 'COMPLETADA';

create or replace function public.generar_codigo_solicitud(p_solicitud_id uuid,p_codigo text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; expires timestamptz := now()+interval '24 hours';
begin
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not found or auth.uid() is distinct from booking.cliente_id or not exists(
        select 1 from public.usuarios where id=auth.uid() and rol='CLIENTE' and activo
    ) then
        raise exception 'Operacion no permitida' using errcode='42501';
    end if;
    if p_codigo is null or p_codigo !~ '^[0-9]{6}$'
        or not ((booking.modalidad='DOMICILIO' and booking.estado='EN_CURSO')
            or (booking.modalidad='TALLER' and booking.estado='LISTO')) then
        raise exception 'No se puede generar el codigo en este estado' using errcode='PT409';
    end if;
    if exists(select 1 from public.confirmaciones_solicitud where solicitud_id=booking.id and intentos>=5) then
        raise exception 'El codigo esta bloqueado por intentos fallidos' using errcode='PT409';
    end if;
    insert into public.confirmaciones_solicitud(solicitud_id,codigo_hash,expira_en)
    values(booking.id,sha256(convert_to(booking.id::text||':'||p_codigo,'UTF8')),expires)
    on conflict(solicitud_id) do update set codigo_hash=excluded.codigo_hash,expira_en=excluded.expira_en;
    return expires;
end; $$;

create or replace function public.completar_solicitud(p_solicitud_id uuid,p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare booking public.solicitudes; confirmation public.confirmaciones_solicitud;
begin
    select * into booking from public.solicitudes where id=p_solicitud_id for update;
    if not found or auth.uid() is distinct from booking.trabajador_id or not public.es_trabajador() then
        raise exception 'Solicitud no encontrada' using errcode='P0002';
    end if;
    if not ((booking.modalidad='DOMICILIO' and booking.estado='EN_CURSO')
        or (booking.modalidad='TALLER' and booking.estado='LISTO')) then
        raise exception 'Transicion no permitida' using errcode='PT409';
    end if;
    select * into confirmation from public.confirmaciones_solicitud where solicitud_id=booking.id for update;
    if not found or confirmation.expira_en<=now() or confirmation.intentos>=5 then
        return jsonb_build_object('error','codigo_no_disponible');
    end if;
    if p_codigo is null or p_codigo !~ '^[0-9]{6}$'
        or confirmation.codigo_hash <> sha256(convert_to(booking.id::text||':'||p_codigo,'UTF8')) then
        update public.confirmaciones_solicitud set intentos=intentos+1 where solicitud_id=booking.id;
        return jsonb_build_object('error','codigo_invalido');
    end if;
    update public.solicitudes set estado='COMPLETADA' where id=booking.id returning * into booking;
    return to_jsonb(booking);
end; $$;
revoke all on function public.generar_codigo_solicitud(uuid,text) from public, anon;
revoke all on function public.completar_solicitud(uuid,text) from public, anon;
grant execute on function public.generar_codigo_solicitud(uuid,text) to authenticated;
grant execute on function public.completar_solicitud(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
