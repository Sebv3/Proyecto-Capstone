begin;

create function public.limpiar_notificaciones_finalizadas()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
    if auth.uid() is null or not exists (
        select 1 from public.usuarios where id = auth.uid() and activo
    ) then
        raise exception 'Cuenta no autorizada' using errcode = '42501';
    end if;
    delete from public.notificaciones n
    where n.usuario_id = auth.uid() and n.tipo = 'SOLICITUD'
      and exists (
          select 1 from public.solicitudes s
          where s.id = n.referencia_id
            and auth.uid() in (s.cliente_id, s.trabajador_id)
            and (
                s.estado in ('COMPLETADA', 'CANCELADA', 'RECHAZADA')
                or (s.estado in ('PENDIENTE', 'ACEPTADA') and s.inicio_en < now())
            )
      );
    get diagnostics affected = row_count;
    return affected;
end; $$;

revoke all on function public.limpiar_notificaciones_finalizadas() from public, anon;
grant execute on function public.limpiar_notificaciones_finalizadas() to authenticated;

-- Older clients must not be able to bypass the new retention rule.
create or replace function public.limpiar_notificaciones(p_solo_leidas boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
begin
    return public.limpiar_notificaciones_finalizadas();
end; $$;

notify pgrst, 'reload schema';
commit;
