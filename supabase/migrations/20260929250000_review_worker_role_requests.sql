-- Let an active administrator approve or reject a worker-role request atomically.

create or replace function public.revisar_solicitud_rol_trabajador(
    p_solicitud_id uuid,
    p_estado public.estado_solicitud_rol,
    p_motivo text default null
)
returns setof public.solicitudes_rol_trabajador
language plpgsql
security definer
set search_path = ''
as $$
declare
    administrador_id uuid := auth.uid();
    usuario_solicitante_id uuid;
    motivo_normalizado text := nullif(trim(p_motivo), '');
begin
    if not exists (
        select 1 from public.usuarios
        where id = administrador_id
          and rol = 'ADMIN'
          and activo
    ) then
        raise exception 'Solo un administrador activo puede revisar solicitudes'
            using errcode = '42501';
    end if;

    if p_estado not in ('APROBADA', 'RECHAZADA') then
        raise exception 'El estado debe ser APROBADA o RECHAZADA'
            using errcode = '22023';
    end if;
    if p_estado = 'RECHAZADA' and motivo_normalizado is null then
        raise exception 'Debe indicar el motivo del rechazo'
            using errcode = '22023';
    end if;
    if p_estado = 'APROBADA' and motivo_normalizado is not null then
        raise exception 'Una aprobacion no debe incluir motivo de rechazo'
            using errcode = '22023';
    end if;

    select usuario_id
    into usuario_solicitante_id
    from public.solicitudes_rol_trabajador
    where id = p_solicitud_id
      and estado = 'PENDIENTE'
    for update;

    if usuario_solicitante_id is null then
        raise exception 'No existe una solicitud pendiente con ese identificador'
            using errcode = 'P0002';
    end if;

    if not exists (
        select 1 from public.usuarios
        where id = usuario_solicitante_id
          and rol = 'CLIENTE'
          and activo
    ) then
        raise exception 'La solicitud no pertenece a un cliente activo'
            using errcode = 'P0001';
    end if;

    if p_estado = 'APROBADA' then
        if exists (
            select 1 from public.trabajadores
            where usuario_id = usuario_solicitante_id
        ) then
            raise exception 'El usuario ya posee un perfil de trabajador'
                using errcode = 'P0001';
        end if;

        insert into public.trabajadores (usuario_id, direccion_base, comuna_id)
        select cliente.usuario_id, cliente.direccion, cliente.comuna_id
        from public.clientes as cliente
        where cliente.usuario_id = usuario_solicitante_id;

        if not found then
            raise exception 'El cliente no posee un perfil con direccion y comuna'
                using errcode = 'P0001';
        end if;

        update public.usuarios
        set rol = 'TRABAJADOR'
        where id = usuario_solicitante_id;
    end if;

    return query
    update public.solicitudes_rol_trabajador
    set estado = p_estado,
        motivo_rechazo = motivo_normalizado,
        revisado_por = administrador_id,
        revisado_en = now()
    where id = p_solicitud_id
    returning *;
end;
$$;

revoke all on function public.revisar_solicitud_rol_trabajador(
    uuid, public.estado_solicitud_rol, text
) from public;
grant execute on function public.revisar_solicitud_rol_trabajador(
    uuid, public.estado_solicitud_rol, text
) to authenticated;

comment on function public.revisar_solicitud_rol_trabajador(
    uuid, public.estado_solicitud_rol, text
) is 'Reviews a pending worker-role request and creates the worker profile on approval.';
