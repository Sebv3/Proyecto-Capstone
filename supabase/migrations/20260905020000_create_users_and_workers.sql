-- Initial identity and profile model for ServiMatch.

create type public.usuario_rol as enum ('CLIENTE', 'TRABAJADOR', 'ADMIN');
create type public.estado_verificacion as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');

create table public.usuarios (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    nombre text not null check (char_length(trim(nombre)) between 2 and 120),
    telefono text check (telefono is null or telefono ~ '^[+]?[0-9 ]{8,15}$'),
    avatar_url text,
    rol public.usuario_rol not null,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create table public.trabajadores (
    usuario_id uuid primary key references public.usuarios (id) on delete cascade,
    rut text not null unique check (rut ~ '^[0-9]{7,8}-[0-9Kk]$'),
    direccion_base text not null check (char_length(trim(direccion_base)) >= 5),
    latitud numeric(9, 6) check (latitud between -90 and 90),
    longitud numeric(9, 6) check (longitud between -180 and 180),
    estado_verificacion public.estado_verificacion not null default 'PENDIENTE',
    motivo_rechazo text,
    verificado_en timestamptz,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint coordenadas_completas check (
        (latitud is null and longitud is null)
        or (latitud is not null and longitud is not null)
    )
);

create index trabajadores_estado_verificacion_idx
    on public.trabajadores (estado_verificacion);

create or replace function public.actualizar_marca_de_tiempo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$;

create trigger usuarios_actualizar_marca_de_tiempo
before update on public.usuarios
for each row execute function public.actualizar_marca_de_tiempo();

create trigger trabajadores_actualizar_marca_de_tiempo
before update on public.trabajadores
for each row execute function public.actualizar_marca_de_tiempo();

create or replace function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    rol_solicitado text;
    nombre_solicitado text;
begin
    rol_solicitado := upper(coalesce(new.raw_user_meta_data ->> 'rol', 'CLIENTE'));
    nombre_solicitado := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
    );

    if rol_solicitado not in ('CLIENTE', 'TRABAJADOR') then
        raise exception 'Rol de registro no permitido';
    end if;

    insert into public.usuarios (id, email, nombre, rol)
    values (
        new.id,
        new.email,
        nombre_solicitado,
        rol_solicitado::public.usuario_rol
    );

    return new;
end;
$$;

create trigger auth_crear_perfil_de_usuario
after insert on auth.users
for each row execute function public.crear_perfil_de_usuario();

create or replace function public.sincronizar_email_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.usuarios
    set email = new.email
    where id = new.id;

    return new;
end;
$$;

create trigger auth_sincronizar_email_de_usuario
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sincronizar_email_de_usuario();

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.usuarios
        where id = (select auth.uid())
          and rol = 'ADMIN'
          and activo
    );
$$;

create or replace function public.es_trabajador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.usuarios
        where id = (select auth.uid())
          and rol = 'TRABAJADOR'
          and activo
    );
$$;

revoke all on function public.es_admin() from public;
revoke all on function public.es_trabajador() from public;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_trabajador() to authenticated;

create or replace function public.forzar_verificacion_pendiente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.estado_verificacion = 'PENDIENTE';
    new.motivo_rechazo = null;
    new.verificado_en = null;
    return new;
end;
$$;

create trigger trabajadores_forzar_verificacion_pendiente
before insert on public.trabajadores
for each row execute function public.forzar_verificacion_pendiente();

alter table public.usuarios enable row level security;
alter table public.trabajadores enable row level security;

create policy usuarios_leer_perfil_propio
on public.usuarios
for select
to authenticated
using (id = (select auth.uid()) or (select public.es_admin()));

create policy usuarios_editar_perfil_propio
on public.usuarios
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy trabajadores_leer_perfil_propio
on public.trabajadores
for select
to authenticated
using (usuario_id = (select auth.uid()) or (select public.es_admin()));

create policy trabajadores_crear_perfil_propio
on public.trabajadores
for insert
to authenticated
with check (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
);

create policy trabajadores_editar_perfil_propio
on public.trabajadores
for update
to authenticated
using (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
)
with check (
    usuario_id = (select auth.uid())
    and (select public.es_trabajador())
);

revoke all on table public.usuarios from anon, authenticated;
grant select on table public.usuarios to authenticated;
grant update (nombre, telefono, avatar_url) on table public.usuarios to authenticated;

revoke all on table public.trabajadores from anon, authenticated;
grant select, insert on table public.trabajadores to authenticated;
grant update (rut, direccion_base, latitud, longitud) on table public.trabajadores
    to authenticated;

comment on table public.usuarios is
    'Private application profile linked one-to-one with Supabase Auth.';
comment on table public.trabajadores is
    'Private worker identity and verification data. Public worker data must use a safe view or API DTO.';
