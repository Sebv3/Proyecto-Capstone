-- Existing workers have no reliable commune in their free-text address.
-- Keep those rows intact, but require a commune for every new or updated row.
alter table public.trabajadores
    add column comuna_id uuid references public.comunas (id) on delete restrict;

create index trabajadores_comuna_id_idx on public.trabajadores (comuna_id);

alter table public.trabajadores
    add constraint trabajadores_comuna_requerida check (comuna_id is not null) not valid;

create or replace function public.validar_comuna_trabajador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.comunas
        where id = new.comuna_id and activa
    ) then
        raise exception 'La comuna seleccionada no esta disponible';
    end if;
    return new;
end;
$$;

create trigger trabajadores_validar_comuna
before insert or update of comuna_id on public.trabajadores
for each row execute function public.validar_comuna_trabajador();

-- Accounts created by the previous flow can complete commune before upload.
drop policy if exists trabajadores_editar_perfil_propio on public.trabajadores;

create policy trabajadores_editar_perfil_propio
on public.trabajadores
for update to authenticated
using (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
    and (
        comuna_id is null
        or exists (
            select 1 from public.verificaciones_trabajador as v
            where v.trabajador_id = (select auth.uid())
        )
    )
)
with check (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
);

grant update (comuna_id) on public.trabajadores to authenticated;

drop policy if exists verificaciones_enviar_propias
on public.verificaciones_trabajador;

create policy verificaciones_enviar_propias
on public.verificaciones_trabajador
for insert to authenticated
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
    and exists (
        select 1 from public.trabajadores as t
        where t.usuario_id = (select auth.uid())
          and t.comuna_id is not null
    )
);

drop policy if exists verificaciones_corregir_propias
on public.verificaciones_trabajador;

create policy verificaciones_corregir_propias
on public.verificaciones_trabajador
for update to authenticated
using (
    trabajador_id = (select auth.uid())
    and estado = 'RECHAZADA'
    and (select public.es_trabajador())
    and exists (
        select 1 from public.trabajadores as t
        where t.usuario_id = (select auth.uid())
          and t.comuna_id is not null
    )
)
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

drop policy if exists documentos_verificacion_subir on storage.objects;

create policy documentos_verificacion_subir
on storage.objects
for insert to authenticated
with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and exists (
        select 1 from public.trabajadores as t
        where t.usuario_id = (select auth.uid())
          and t.comuna_id is not null
    )
    and not exists (
        select 1 from public.verificaciones_trabajador as v
        where v.trabajador_id = (select auth.uid())
          and v.estado in ('PENDIENTE', 'APROBADA')
    )
);

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
    if rut_solicitado is null or not public.rut_chileno_valido(rut_solicitado) then
        raise exception 'Debe proporcionar un RUT chileno valido';
    end if;
    if direccion_solicitada is null
       or char_length(direccion_solicitada) not between 5 and 200 then
        raise exception 'Debe proporcionar una direccion valida';
    end if;

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

    insert into public.usuarios (id, email, nombre, rut, rol)
    values (
        new.id, new.email, nombre_solicitado, rut_solicitado,
        rol_solicitado::public.usuario_rol
    );

    if rol_solicitado = 'CLIENTE' then
        insert into public.clientes (usuario_id, direccion, comuna_id)
        values (new.id, direccion_solicitada, comuna_solicitada);
    else
        insert into public.trabajadores (usuario_id, direccion_base, comuna_id)
        values (new.id, direccion_solicitada, comuna_solicitada);
    end if;
    return new;
end;
$$;

comment on column public.trabajadores.comuna_id is
    'Structured commune. Legacy workers must select it; never infer it from direccion_base.';
