-- Require identity documents before a client can submit a worker-role request.

alter table public.solicitudes_rol_trabajador
    add column carnet_frontal_path text,
    add column carnet_reverso_path text,
    add column selfie_path text;

drop policy if exists solicitudes_rol_crear_propias
on public.solicitudes_rol_trabajador;

create policy solicitudes_rol_crear_propias
on public.solicitudes_rol_trabajador
for insert to authenticated
with check (
    usuario_id = (select auth.uid())
    and estado = 'PENDIENTE'
    and carnet_frontal_path like (select auth.uid())::text || '/solicitudes-rol/%'
    and carnet_reverso_path like (select auth.uid())::text || '/solicitudes-rol/%'
    and selfie_path like (select auth.uid())::text || '/solicitudes-rol/%'
    and exists (
        select 1 from public.usuarios
        where id = (select auth.uid())
          and rol = 'CLIENTE'
          and activo
    )
);

create policy solicitudes_rol_documentos_subir
on storage.objects
for insert to authenticated
with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'solicitudes-rol'
    and (select public.es_cliente())
    and not exists (
        select 1 from public.solicitudes_rol_trabajador
        where usuario_id = (select auth.uid())
          and estado = 'PENDIENTE'
    )
);

create policy solicitudes_rol_documentos_eliminar
on storage.objects
for delete to authenticated
using (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'solicitudes-rol'
    and (select public.es_cliente())
);

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
    solicitud public.solicitudes_rol_trabajador%rowtype;
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

    select * into solicitud
    from public.solicitudes_rol_trabajador
    where id = p_solicitud_id
      and estado = 'PENDIENTE'
    for update;

    if solicitud.id is null then
        raise exception 'No existe una solicitud pendiente con ese identificador'
            using errcode = 'P0002';
    end if;

    if not exists (
        select 1 from public.usuarios
        where id = solicitud.usuario_id
          and rol = 'CLIENTE'
          and activo
    ) then
        raise exception 'La solicitud no pertenece a un cliente activo'
            using errcode = 'P0001';
    end if;

    if p_estado = 'APROBADA' then
        if solicitud.carnet_frontal_path is null
           or solicitud.carnet_reverso_path is null
           or solicitud.selfie_path is null then
            raise exception 'La solicitud no posee los tres documentos requeridos'
                using errcode = 'P0001';
        end if;
        if exists (
            select 1 from public.trabajadores
            where usuario_id = solicitud.usuario_id
        ) then
            raise exception 'El usuario ya posee un perfil de trabajador'
                using errcode = 'P0001';
        end if;

        insert into public.trabajadores (usuario_id, direccion_base, comuna_id)
        select cliente.usuario_id, cliente.direccion, cliente.comuna_id
        from public.clientes as cliente
        where cliente.usuario_id = solicitud.usuario_id;

        if not found then
            raise exception 'El cliente no posee un perfil con direccion y comuna'
                using errcode = 'P0001';
        end if;

        update public.usuarios
        set rol = 'TRABAJADOR'
        where id = solicitud.usuario_id;

        insert into public.verificaciones_trabajador (
            trabajador_id, carnet_frontal_path, carnet_reverso_path, selfie_path
        ) values (
            solicitud.usuario_id, solicitud.carnet_frontal_path,
            solicitud.carnet_reverso_path, solicitud.selfie_path
        );

        update public.verificaciones_trabajador
        set estado = 'APROBADA',
            motivo_rechazo = null,
            revisado_por = administrador_id,
            revisado_en = now()
        where trabajador_id = solicitud.usuario_id;
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

comment on column public.solicitudes_rol_trabajador.carnet_frontal_path is
    'Private Storage path submitted before the role request becomes pending.';
