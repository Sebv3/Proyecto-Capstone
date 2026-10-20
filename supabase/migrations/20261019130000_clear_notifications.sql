begin;

create function public.limpiar_notificaciones(p_solo_leidas boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
    if auth.uid() is null or not exists (
        select 1 from public.usuarios where id = auth.uid() and activo
    ) then
        raise exception 'Cuenta no autorizada' using errcode = '42501';
    end if;
    delete from public.notificaciones
    where usuario_id = auth.uid()
      and (not coalesce(p_solo_leidas, true) or leida_en is not null);
    get diagnostics affected = row_count;
    return affected;
end; $$;

revoke all on function public.limpiar_notificaciones(boolean) from public, anon;
grant execute on function public.limpiar_notificaciones(boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
