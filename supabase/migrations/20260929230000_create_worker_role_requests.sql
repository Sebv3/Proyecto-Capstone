-- Persist client requests to become workers without changing their current role.

create type public.estado_solicitud_rol as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');

create table public.solicitudes_rol_trabajador (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references public.usuarios (id) on delete cascade,
    estado public.estado_solicitud_rol not null default 'PENDIENTE',
    motivo_rechazo text,
    revisado_por uuid references public.usuarios (id) on delete set null,
    revisado_en timestamptz,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint solicitudes_rol_revision_coherente check (
        (estado = 'PENDIENTE' and motivo_rechazo is null
            and revisado_por is null and revisado_en is null)
        or (estado = 'APROBADA' and motivo_rechazo is null
            and revisado_por is not null and revisado_en is not null)
        or (estado = 'RECHAZADA' and nullif(trim(motivo_rechazo), '') is not null
            and revisado_por is not null and revisado_en is not null)
    )
);

create unique index solicitudes_rol_pendiente_usuario_idx
on public.solicitudes_rol_trabajador (usuario_id)
where estado = 'PENDIENTE';

create index solicitudes_rol_estado_idx
on public.solicitudes_rol_trabajador (estado, creado_en);

create trigger solicitudes_rol_actualizar_marca_de_tiempo
before update on public.solicitudes_rol_trabajador
for each row execute function public.actualizar_marca_de_tiempo();

alter table public.solicitudes_rol_trabajador enable row level security;

create policy solicitudes_rol_leer_propias
on public.solicitudes_rol_trabajador
for select to authenticated
using (usuario_id = (select auth.uid()) or (select public.es_admin()));

create policy solicitudes_rol_crear_propias
on public.solicitudes_rol_trabajador
for insert to authenticated
with check (
    usuario_id = (select auth.uid())
    and estado = 'PENDIENTE'
    and exists (
        select 1 from public.usuarios
        where id = (select auth.uid())
          and rol = 'CLIENTE'
          and activo
    )
);

create policy solicitudes_rol_revisar_admin
on public.solicitudes_rol_trabajador
for update to authenticated
using ((select public.es_admin()))
with check ((select public.es_admin()));

revoke all on table public.solicitudes_rol_trabajador from anon, authenticated;
grant select, insert on table public.solicitudes_rol_trabajador to authenticated;
grant update (estado, motivo_rechazo, revisado_por, revisado_en)
on table public.solicitudes_rol_trabajador to authenticated;

comment on table public.solicitudes_rol_trabajador is
    'Client requests for a future administrative transition to the worker role.';
