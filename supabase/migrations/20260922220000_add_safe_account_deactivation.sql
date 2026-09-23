-- Allow an authenticated client to deactivate their own account without deleting history.

create or replace function public.desactivar_cuenta_actual()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    usuario_actual uuid := (select auth.uid());
begin
    if usuario_actual is null then
        raise exception 'Se requiere autenticacion';
    end if;

    update public.usuarios
    set activo = false
    where id = usuario_actual
      and rol = 'CLIENTE'
      and activo;

    return found;
end;
$$;

revoke all on function public.desactivar_cuenta_actual() from public;
grant execute on function public.desactivar_cuenta_actual() to authenticated;

comment on function public.desactivar_cuenta_actual() is
    'Soft-deactivates the authenticated client account while preserving its history.';
