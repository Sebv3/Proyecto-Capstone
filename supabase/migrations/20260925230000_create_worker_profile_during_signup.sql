-- A worker address is supplied during signup and persisted with the user.
-- This replaces the earlier trigger implementation that created only clients.

create or replace function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rol_solicitado text;
    nombre_solicitado text;
    rut_solicitado text;
    direccion_solicitada text;
    comuna_solicitada uuid;
begin
    rol_solicitado := upper(coalesce(new.raw_user_meta_data ->> 'rol', ''));
    nombre_solicitado := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
    );
    rut_solicitado := public.normalizar_rut_chileno(
        new.raw_user_meta_data ->> 'rut'
    );
    direccion_solicitada := nullif(trim(
        case
            when rol_solicitado = 'TRABAJADOR'
                then new.raw_user_meta_data ->> 'direccion_base'
            else new.raw_user_meta_data ->> 'direccion'
        end
    ), '');

    if rol_solicitado not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Debe seleccionar el rol CLIENTE o TRABAJADOR';
    end if;

    if rut_solicitado is null
       or not public.rut_chileno_valido(rut_solicitado) then
        raise exception 'Debe proporcionar un RUT chileno valido';
    end if;

    if direccion_solicitada is null
       or char_length(direccion_solicitada) not between 5 and 200 then
        raise exception 'Debe proporcionar una direccion valida';
    end if;

    if rol_solicitado = 'CLIENTE' then
        begin
            comuna_solicitada := (new.raw_user_meta_data ->> 'comuna_id')::uuid;
        exception
            when invalid_text_representation then
                raise exception 'Debe seleccionar una comuna valida';
        end;

        if comuna_solicitada is null
           or not exists (
               select 1 from public.comunas
               where id = comuna_solicitada and activa
           ) then
            raise exception 'Debe seleccionar una comuna activa';
        end if;
    end if;

    insert into public.usuarios (id, email, nombre, rut, rol)
    values (
        new.id, new.email, nombre_solicitado, rut_solicitado,
        rol_solicitado::public.usuario_rol
    );

    if rol_solicitado = 'CLIENTE' then
        insert into public.clientes (usuario_id, direccion, comuna_id)
        values (new.id, direccion_solicitada, comuna_solicitada);
    else
        insert into public.trabajadores (usuario_id, direccion_base)
        values (new.id, direccion_solicitada);
    end if;

    return new;
end;
$$;

comment on function public.crear_perfil_de_usuario() is
    'Creates the user and their client or worker profile atomically during signup.';

-- Address edits are unavailable until documents have been submitted.
drop policy if exists trabajadores_editar_perfil_propio on public.trabajadores;

create policy trabajadores_editar_perfil_propio
on public.trabajadores
for update to authenticated
using (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
    and exists (
        select 1 from public.verificaciones_trabajador as v
        where v.trabajador_id = (select auth.uid())
    )
)
with check (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
);
