-- Client profiles and the commune catalog for the Metropolitan Region.

create table public.comunas (
    id uuid primary key default gen_random_uuid(),
    nombre text not null unique,
    activa boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint comunas_nombre_valido check (
        nombre = trim(nombre)
        and char_length(nombre) between 2 and 80
    )
);

create trigger comunas_actualizar_marca_de_tiempo
before update on public.comunas
for each row execute function public.actualizar_marca_de_tiempo();

create or replace function public.es_cliente()
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
          and rol = 'CLIENTE'
          and activo
    );
$$;

revoke all on function public.es_cliente() from public;
grant execute on function public.es_cliente() to authenticated;

create table public.clientes (
    usuario_id uuid primary key
        references public.usuarios (id) on delete cascade,
    direccion text not null,
    comuna_id uuid not null
        references public.comunas (id) on delete restrict,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint clientes_direccion_valida check (
        direccion = trim(direccion)
        and char_length(direccion) between 5 and 200
    )
);

create index clientes_comuna_id_idx on public.clientes (comuna_id);

create trigger clientes_actualizar_marca_de_tiempo
before update on public.clientes
for each row execute function public.actualizar_marca_de_tiempo();

create or replace function public.validar_perfil_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from public.usuarios
        where id = new.usuario_id
          and rol = 'CLIENTE'
          and activo
    ) then
        raise exception 'El perfil debe pertenecer a un cliente activo';
    end if;

    if not exists (
        select 1
        from public.comunas
        where id = new.comuna_id
          and activa
    ) then
        raise exception 'La comuna seleccionada no esta disponible';
    end if;

    return new;
end;
$$;

create trigger clientes_validar_perfil
before insert or update of usuario_id, comuna_id
on public.clientes
for each row execute function public.validar_perfil_cliente();

alter table public.comunas enable row level security;
alter table public.clientes enable row level security;

create policy comunas_leer_activas
on public.comunas
for select
to authenticated
using (activa or (select public.es_admin()));

create policy clientes_leer_perfil_propio
on public.clientes
for select
to authenticated
using (
    usuario_id = (select auth.uid())
    or (select public.es_admin())
);

create policy clientes_crear_perfil_propio
on public.clientes
for insert
to authenticated
with check (
    usuario_id = (select auth.uid())
    and (select public.es_cliente())
);

create policy clientes_editar_perfil_propio
on public.clientes
for update
to authenticated
using (
    usuario_id = (select auth.uid())
    and (select public.es_cliente())
)
with check (
    usuario_id = (select auth.uid())
    and (select public.es_cliente())
);

revoke all on table public.comunas from anon, authenticated;
grant select on table public.comunas to authenticated;

revoke all on table public.clientes from anon, authenticated;
grant select, insert on table public.clientes to authenticated;
grant update (direccion, comuna_id) on table public.clientes to authenticated;

comment on table public.comunas is
    'Catalog of communes enabled for ServiMatch in the Metropolitan Region of Santiago.';
comment on table public.clientes is
    'Private client profile linked one-to-one with the application user.';
