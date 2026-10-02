-- Materialize every approved client-to-worker request, regardless of whether
-- the approval came through the API RPC or an administrative table update.

create or replace function public.sincronizar_solicitud_rol_aprobada(
    p_solicitud_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    solicitud public.solicitudes_rol_trabajador%rowtype;
    rol_actual public.usuario_rol;
    usuario_activo boolean;
begin
    select * into solicitud
    from public.solicitudes_rol_trabajador
    where id = p_solicitud_id;

    if solicitud.id is null or solicitud.estado <> 'APROBADA' then
        return;
    end if;

    if solicitud.carnet_frontal_path is null
       or solicitud.carnet_reverso_path is null
       or solicitud.selfie_path is null then
        raise exception 'La solicitud aprobada no posee los tres documentos requeridos'
            using errcode = '23514';
    end if;

    if not exists (
        select 1 from public.usuarios
        where id = solicitud.revisado_por
          and rol = 'ADMIN'
          and activo
    ) then
        raise exception 'La solicitud debe ser revisada por un administrador activo'
            using errcode = '23514';
    end if;

    select rol, activo into rol_actual, usuario_activo
    from public.usuarios
    where id = solicitud.usuario_id
    for update;

    if rol_actual is null or not usuario_activo
       or rol_actual not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'La solicitud no pertenece a un cliente o trabajador activo'
            using errcode = '23514';
    end if;

    insert into public.trabajadores (usuario_id, direccion_base, comuna_id)
    select cliente.usuario_id, cliente.direccion, cliente.comuna_id
    from public.clientes as cliente
    where cliente.usuario_id = solicitud.usuario_id
    on conflict (usuario_id) do nothing;

    if not exists (
        select 1 from public.trabajadores
        where usuario_id = solicitud.usuario_id
    ) then
        raise exception 'El cliente no posee un perfil con direccion y comuna'
            using errcode = '23514';
    end if;

    update public.usuarios
    set rol = 'TRABAJADOR'
    where id = solicitud.usuario_id
      and rol = 'CLIENTE';

    insert into public.verificaciones_trabajador (
        trabajador_id, carnet_frontal_path, carnet_reverso_path, selfie_path
    ) values (
        solicitud.usuario_id, solicitud.carnet_frontal_path,
        solicitud.carnet_reverso_path, solicitud.selfie_path
    )
    on conflict (trabajador_id) do update
    set carnet_frontal_path = excluded.carnet_frontal_path,
        carnet_reverso_path = excluded.carnet_reverso_path,
        selfie_path = excluded.selfie_path;

    update public.verificaciones_trabajador
    set estado = 'APROBADA',
        motivo_rechazo = null,
        revisado_por = solicitud.revisado_por,
        revisado_en = solicitud.revisado_en
    where trabajador_id = solicitud.usuario_id;
end;
$$;

revoke all on function public.sincronizar_solicitud_rol_aprobada(uuid)
from public;

create or replace function public.sincronizar_solicitud_rol_aprobada_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.sincronizar_solicitud_rol_aprobada(new.id);
    return new;
end;
$$;

revoke all on function public.sincronizar_solicitud_rol_aprobada_trigger()
from public;

drop trigger if exists solicitudes_rol_sincronizar_aprobacion
on public.solicitudes_rol_trabajador;

create trigger solicitudes_rol_sincronizar_aprobacion
after update of estado on public.solicitudes_rol_trabajador
for each row
when (old.estado = 'PENDIENTE' and new.estado = 'APROBADA')
execute function public.sincronizar_solicitud_rol_aprobada_trigger();

-- Repair previously approved requests that have documents but were updated
-- directly and therefore did not execute the administrative RPC.
do $$
declare
    solicitud_id uuid;
begin
    for solicitud_id in
        select solicitud.id
        from public.solicitudes_rol_trabajador as solicitud
        join public.usuarios as usuario
          on usuario.id = solicitud.usuario_id
        join public.usuarios as administrador
          on administrador.id = solicitud.revisado_por
        where solicitud.estado = 'APROBADA'
          and solicitud.carnet_frontal_path is not null
          and solicitud.carnet_reverso_path is not null
          and solicitud.selfie_path is not null
          and usuario.rol in ('CLIENTE', 'TRABAJADOR')
          and usuario.activo
          and administrador.rol = 'ADMIN'
          and administrador.activo
          and not exists (
              select 1 from public.verificaciones_trabajador as verificacion
              where verificacion.trabajador_id = solicitud.usuario_id
          )
    loop
        perform public.sincronizar_solicitud_rol_aprobada(solicitud_id);
    end loop;
end;
$$;

comment on function public.sincronizar_solicitud_rol_aprobada(uuid) is
    'Creates the worker profile and approved verification for an approved role request.';
