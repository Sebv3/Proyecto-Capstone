-- Update both halves of a client profile in one PostgreSQL transaction.
-- This function runs with the caller's privileges and existing RLS policies.

create function public.actualizar_perfil_cliente_actual(
    p_nombre text default null,
    p_telefono text default null,
    p_actualizar_telefono boolean default false,
    p_direccion text default null,
    p_comuna_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
    usuario_actual uuid := (select auth.uid());
begin
    if usuario_actual is null or not (select public.es_cliente()) then
        raise exception 'Se requiere una cuenta cliente activa';
    end if;

    if not exists (
        select 1 from public.clientes where usuario_id = usuario_actual
    ) then
        return false;
    end if;

    if p_comuna_id is not null and not exists (
        select 1 from public.comunas where id = p_comuna_id and activa
    ) then
        raise exception 'La comuna seleccionada no esta disponible';
    end if;

    if p_nombre is not null or p_actualizar_telefono then
        update public.usuarios
        set nombre = coalesce(p_nombre, nombre),
            telefono = case when p_actualizar_telefono then p_telefono else telefono end
        where id = usuario_actual;
    end if;

    if p_direccion is not null and p_comuna_id is not null then
        update public.clientes
        set direccion = p_direccion,
            comuna_id = p_comuna_id
        where usuario_id = usuario_actual;
    elsif p_direccion is not null then
        update public.clientes set direccion = p_direccion where usuario_id = usuario_actual;
    elsif p_comuna_id is not null then
        update public.clientes set comuna_id = p_comuna_id where usuario_id = usuario_actual;
    end if;

    return true;
end;
$$;

revoke all on function public.actualizar_perfil_cliente_actual(
    text, text, boolean, text, uuid
) from public;
grant execute on function public.actualizar_perfil_cliente_actual(
    text, text, boolean, text, uuid
) to authenticated;
