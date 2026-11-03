-- Soft-deactivate the same account from either active mode, preserving all history.
begin;
create or replace function public.desactivar_cuenta_actual()
returns boolean language plpgsql security definer set search_path = '' as $$
declare usuario_actual uuid := auth.uid();
begin
    if usuario_actual is null then
        raise exception 'Se requiere autenticacion' using errcode = '42501';
    end if;
    update public.usuarios set activo = false
    where id = usuario_actual and activo and rol in ('CLIENTE', 'TRABAJADOR');
    return found;
end; $$;
revoke all on function public.desactivar_cuenta_actual() from public, anon;
grant execute on function public.desactivar_cuenta_actual() to authenticated;
comment on function public.desactivar_cuenta_actual() is
    'Soft-deactivates the authenticated client or worker account, preserving both profiles and history.';
notify pgrst, 'reload schema';
commit;
