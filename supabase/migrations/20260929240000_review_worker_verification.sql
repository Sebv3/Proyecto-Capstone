-- Let an active administrator review a pending worker verification atomically.

create or replace function public.revisar_verificacion_trabajador(
    p_trabajador_id uuid,
    p_estado public.estado_verificacion,
    p_motivo text default null
)
returns setof public.verificaciones_trabajador
language plpgsql
security definer
set search_path = ''
as $$
declare
    administrador_id uuid := auth.uid();
    motivo_normalizado text := nullif(trim(p_motivo), '');
begin
    if not exists (
        select 1 from public.usuarios
        where id = administrador_id
          and rol = 'ADMIN'
          and activo
    ) then
        raise exception 'Solo un administrador activo puede revisar verificaciones'
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

    return query
    update public.verificaciones_trabajador
    set estado = p_estado,
        motivo_rechazo = motivo_normalizado,
        revisado_por = administrador_id,
        revisado_en = now()
    where trabajador_id = p_trabajador_id
      and estado = 'PENDIENTE'
    returning *;

    if not found then
        raise exception 'No existe una verificacion pendiente para este trabajador'
            using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.revisar_verificacion_trabajador(
    uuid, public.estado_verificacion, text
) from public;
grant execute on function public.revisar_verificacion_trabajador(
    uuid, public.estado_verificacion, text
) to authenticated;

comment on function public.revisar_verificacion_trabajador(
    uuid, public.estado_verificacion, text
) is 'Approves or rejects a pending worker verification as the authenticated administrator.';
