-- Require a Chilean RUT for every user and add private worker verification.

create or replace function public.normalizar_rut_chileno(valor text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
    rut_limpio text;
begin
    rut_limpio := regexp_replace(
        upper(trim(valor)),
        '[.[:space:]-]',
        '',
        'g'
    );

    if char_length(rut_limpio) < 2 then
        return rut_limpio;
    end if;

    return left(rut_limpio, -1) || '-' || right(rut_limpio, 1);
end;
$$;

create or replace function public.rut_chileno_valido(valor text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
    rut_limpio text;
    cuerpo text;
    digito_verificador text;
    digito_esperado text;
    indice integer;
    multiplicador integer := 2;
    suma integer := 0;
    resultado integer;
begin
    if upper(trim(valor)) !~ '^[0-9.K[:space:]-]+$' then
        return false;
    end if;

    rut_limpio := regexp_replace(
        upper(trim(valor)),
        '[.[:space:]-]',
        '',
        'g'
    );

    if rut_limpio !~ '^[0-9]{7,8}[0-9K]$' then
        return false;
    end if;

    cuerpo := left(rut_limpio, -1);
    digito_verificador := right(rut_limpio, 1);

    for indice in reverse char_length(cuerpo)..1 loop
        suma := suma + substring(cuerpo, indice, 1)::integer * multiplicador;
        multiplicador := case when multiplicador = 7 then 2 else multiplicador + 1 end;
    end loop;

    resultado := 11 - (suma % 11);
    digito_esperado := case
        when resultado = 11 then '0'
        when resultado = 10 then 'K'
        else resultado::text
    end;

    return digito_verificador = digito_esperado;
end;
$$;

revoke all on function public.normalizar_rut_chileno(text) from public;
revoke all on function public.rut_chileno_valido(text) from public;
grant execute on function public.normalizar_rut_chileno(text) to authenticated;
grant execute on function public.rut_chileno_valido(text) to authenticated;

alter table public.usuarios add column rut text;

-- Preserve the RUT of workers created with the first migration.
update public.usuarios as usuario
set rut = public.normalizar_rut_chileno(trabajador.rut)
from public.trabajadores as trabajador
where trabajador.usuario_id = usuario.id;

do $$
begin
    if exists (select 1 from public.usuarios where rut is null) then
        raise exception using message =
            'Hay usuarios existentes sin RUT. Complete sus RUT antes de aplicar esta migracion.';
    end if;

    if exists (
        select 1
        from public.usuarios
        where not public.rut_chileno_valido(rut)
    ) then
        raise exception using message =
            'Hay usuarios existentes con un RUT invalido. Corrijalos antes de continuar.';
    end if;

    if exists (
        select 1
        from public.trabajadores
        where estado_verificacion <> 'PENDIENTE'
           or motivo_rechazo is not null
           or verificado_en is not null
    ) then
        raise exception using message =
            'Hay verificaciones de trabajadores ya revisadas. Migrelas manualmente antes de continuar.';
    end if;
end;
$$;

alter table public.usuarios
    alter column rut set not null,
    add constraint usuarios_rut_normalizado_check
        check (rut = public.normalizar_rut_chileno(rut)),
    add constraint usuarios_rut_valido_check
        check (public.rut_chileno_valido(rut)),
    add constraint usuarios_rut_key unique (rut);

revoke update (rut, direccion_base, latitud, longitud)
on public.trabajadores from authenticated;

drop trigger trabajadores_forzar_verificacion_pendiente
on public.trabajadores;
drop function public.forzar_verificacion_pendiente();
drop index public.trabajadores_estado_verificacion_idx;

alter table public.trabajadores
    drop column rut,
    drop column estado_verificacion,
    drop column motivo_rechazo,
    drop column verificado_en;

grant update (direccion_base, latitud, longitud)
on public.trabajadores to authenticated;

create table public.verificaciones_trabajador (
    trabajador_id uuid primary key
        references public.trabajadores (usuario_id) on delete cascade,
    carnet_frontal_path text not null
        check (char_length(trim(carnet_frontal_path)) > 0),
    carnet_reverso_path text not null
        check (char_length(trim(carnet_reverso_path)) > 0),
    selfie_path text not null
        check (char_length(trim(selfie_path)) > 0),
    estado public.estado_verificacion not null default 'PENDIENTE',
    motivo_rechazo text,
    revisado_por uuid references public.usuarios (id) on delete set null,
    revisado_en timestamptz,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint verificaciones_revision_coherente check (
        (
            estado = 'PENDIENTE'
            and motivo_rechazo is null
            and revisado_por is null
            and revisado_en is null
        )
        or (
            estado = 'APROBADA'
            and motivo_rechazo is null
            and revisado_por is not null
            and revisado_en is not null
        )
        or (
            estado = 'RECHAZADA'
            and nullif(trim(motivo_rechazo), '') is not null
            and revisado_por is not null
            and revisado_en is not null
        )
    )
);

create index verificaciones_trabajador_estado_idx
on public.verificaciones_trabajador (estado);

create trigger verificaciones_actualizar_marca_de_tiempo
before update on public.verificaciones_trabajador
for each row execute function public.actualizar_marca_de_tiempo();

create or replace function public.preparar_verificacion_trabajador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT'
       or new.carnet_frontal_path is distinct from old.carnet_frontal_path
       or new.carnet_reverso_path is distinct from old.carnet_reverso_path
       or new.selfie_path is distinct from old.selfie_path then
        new.estado = 'PENDIENTE';
        new.motivo_rechazo = null;
        new.revisado_por = null;
        new.revisado_en = null;
    end if;

    return new;
end;
$$;

create or replace function public.validar_revision_administrativa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.estado in ('APROBADA', 'RECHAZADA')
       and not exists (
           select 1
           from public.usuarios
           where id = new.revisado_por
             and rol = 'ADMIN'
             and activo
       ) then
        raise exception 'La revision debe pertenecer a un administrador activo';
    end if;

    return new;
end;
$$;

create trigger verificaciones_preparar_revision
before insert or update of carnet_frontal_path, carnet_reverso_path, selfie_path
on public.verificaciones_trabajador
for each row execute function public.preparar_verificacion_trabajador();

create trigger verificaciones_validar_revision_administrativa
before insert or update on public.verificaciones_trabajador
for each row execute function public.validar_revision_administrativa();

alter table public.verificaciones_trabajador enable row level security;

create policy verificaciones_leer_propias
on public.verificaciones_trabajador
for select
to authenticated
using (
    trabajador_id = (select auth.uid())
    or (select public.es_admin())
);

create policy verificaciones_enviar_propias
on public.verificaciones_trabajador
for insert
to authenticated
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

create policy verificaciones_corregir_propias
on public.verificaciones_trabajador
for update
to authenticated
using (
    trabajador_id = (select auth.uid())
    and estado <> 'APROBADA'
    and (select public.es_trabajador())
)
with check (
    trabajador_id = (select auth.uid())
    and (select public.es_trabajador())
);

revoke all on table public.verificaciones_trabajador from anon, authenticated;
grant select, insert on table public.verificaciones_trabajador to authenticated;
grant update (carnet_frontal_path, carnet_reverso_path, selfie_path)
on public.verificaciones_trabajador to authenticated;

-- Registration must now include both an explicit role and a valid RUT.
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
begin
    rol_solicitado := upper(coalesce(new.raw_user_meta_data ->> 'rol', ''));
    nombre_solicitado := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
    );
    rut_solicitado := public.normalizar_rut_chileno(
        new.raw_user_meta_data ->> 'rut'
    );

    if rol_solicitado not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Debe seleccionar el rol CLIENTE o TRABAJADOR';
    end if;

    if rut_solicitado is null
       or not public.rut_chileno_valido(rut_solicitado) then
        raise exception 'Debe proporcionar un RUT chileno valido';
    end if;

    insert into public.usuarios (id, email, nombre, rut, rol)
    values (
        new.id,
        new.email,
        nombre_solicitado,
        rut_solicitado,
        rol_solicitado::public.usuario_rol
    );

    return new;
end;
$$;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'documentos-verificacion',
    'documentos-verificacion',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy documentos_verificacion_leer
on storage.objects
for select
to authenticated
using (
    bucket_id = 'documentos-verificacion'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select public.es_admin())
    )
);

create policy documentos_verificacion_subir
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (
        select 1
        from public.verificaciones_trabajador as verificacion
        where verificacion.trabajador_id = (select auth.uid())
          and verificacion.estado = 'APROBADA'
    )
);

create policy documentos_verificacion_actualizar
on storage.objects
for update
to authenticated
using (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (
        select 1
        from public.verificaciones_trabajador as verificacion
        where verificacion.trabajador_id = (select auth.uid())
          and verificacion.estado = 'APROBADA'
    )
)
with check (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy documentos_verificacion_eliminar
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'documentos-verificacion'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.es_trabajador())
    and not exists (
        select 1
        from public.verificaciones_trabajador as verificacion
        where verificacion.trabajador_id = (select auth.uid())
          and verificacion.estado = 'APROBADA'
    )
);

comment on column public.usuarios.rut is
    'Chilean RUT shared by clients and workers, normalized without dots.';
comment on table public.verificaciones_trabajador is
    'Private identity documents reviewed manually by an administrator.';
comment on column public.verificaciones_trabajador.carnet_frontal_path is
    'Private Storage object path, never a public URL.';
